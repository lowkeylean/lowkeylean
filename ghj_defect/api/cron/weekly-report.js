const { put, del } = require('@vercel/blob');
const PDFDocument = require('pdfkit');
const { Resend } = require('resend');
const { initAdmin, adminDb } = require('../_firebase');

const AREAS = ['Rooms', 'Public Area', 'Restaurant'];

function fmtDate(ts) {
  if (!ts) return 'N/A';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val).replace(/\r?\n/g, ' ');
  return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCSV(defects) {
  const header = 'Title,Area,Room,Priority,Type,Reported By,Completed By,Reported Date,Completed Date,Remarks';
  const rows = defects.map((d) =>
    [d.title, d.area, d.room_name, d.priority, d.type,
     d.reported_by, d.completed_by, fmtDate(d.created_at), fmtDate(d.completed_at), d.remarks]
      .map(csvEscape).join(',')
  );
  return [header, ...rows].join('\n');
}

function buildPDF(weekLabel, stats, completedDefects) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.fontSize(20).font('Helvetica-Bold').text('GHJ Defect Manager');
    doc.fontSize(12).font('Helvetica').fillColor('#555555').text(`Weekly Report — ${weekLabel}`);
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown();

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000000').text('Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total defects in system: ${stats.total}`);
    doc.text(`Completed this week: ${stats.completedThisWeek}`);
    doc.text(`Currently active: ${stats.active}`);
    doc.moveDown();

    doc.fontSize(13).font('Helvetica-Bold').text('By Area (All Time)');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    for (const area of AREAS) {
      const c = stats.byArea[area];
      doc.text(`${area}: ${c.completed} completed, ${c.active} active`);
    }
    doc.moveDown();

    doc.fontSize(13).font('Helvetica-Bold').text(`Completed This Week (${completedDefects.length})`);
    doc.moveDown(0.3);

    if (completedDefects.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#888888').text('No defects completed this week.');
    } else {
      for (const d of completedDefects) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text(d.title || 'Untitled');
        doc.fontSize(9).font('Helvetica').fillColor('#333333');
        doc.text(`${d.area} · ${d.room_name} · ${d.priority} priority · ${d.type}`);
        doc.text(`Reported by: ${d.reported_by}   Completed by: ${d.completed_by || 'N/A'}`);
        doc.text(`${fmtDate(d.created_at)} → ${fmtDate(d.completed_at)}`);
        if (d.remarks) doc.text(`Remarks: ${d.remarks}`);
        doc.moveDown(0.5);
      }
    }

    doc.end();
  });
}

module.exports = async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    initAdmin();
    const db = adminDb();

    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Week label: Monday to Sunday of the current week
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekLabel = `${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`;
    const weekId = weekStart.toISOString().slice(0, 10);

    const snap = await db.collection('defects').get();
    const allDefects = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const completedThisWeek = allDefects.filter((d) => {
      if (d.status !== 'Completed' || !d.completed_at) return false;
      const t = d.completed_at.toDate ? d.completed_at.toDate() : new Date(d.completed_at);
      return t >= sevenDaysAgo;
    });

    const stats = {
      total: allDefects.length,
      completedThisWeek: completedThisWeek.length,
      active: allDefects.filter((d) => d.status !== 'Completed').length,
      byArea: {},
    };
    for (const area of AREAS) {
      const areaDefects = allDefects.filter((d) => d.area === area);
      stats.byArea[area] = {
        completed: areaDefects.filter((d) => d.status === 'Completed').length,
        active: areaDefects.filter((d) => d.status !== 'Completed').length,
      };
    }

    const pdfBuf = await buildPDF(weekLabel, stats, completedThisWeek);
    const csvStr = buildCSV(completedThisWeek);

    const [pdfBlob, csvBlob] = await Promise.all([
      put(`reports/${weekId}.pdf`, pdfBuf, { access: 'public', contentType: 'application/pdf' }),
      put(`reports/${weekId}.csv`, Buffer.from(csvStr), { access: 'public', contentType: 'text/csv' }),
    ]);

    // Email — non-fatal so archive is always written even if email fails
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.REPORT_EMAIL_FROM || 'GHJ Defects <onboarding@resend.dev>',
        to: process.env.REPORT_EMAIL_TO,
        subject: `Weekly Defect Report — ${weekLabel}`,
        html: `<p>Weekly GHJ Defect Manager report for <strong>${weekLabel}</strong>.</p>
               <ul>
                 <li>Total defects: ${stats.total}</li>
                 <li>Completed this week: ${stats.completedThisWeek}</li>
                 <li>Active defects: ${stats.active}</li>
               </ul>
               <p>PDF and CSV reports are attached.</p>`,
        attachments: [
          { filename: `ghj-report-${weekId}.pdf`, content: pdfBuf },
          { filename: `ghj-report-${weekId}.csv`, content: Buffer.from(csvStr) },
        ],
      });
    } catch (emailErr) {
      console.error('Email failed:', emailErr.message);
    }

    // Archive report metadata in Firestore
    await db.collection('reports').doc(weekId).set({
      week: weekLabel,
      week_start: weekId,
      generated_at: now,
      pdf_url: pdfBlob.url,
      csv_url: csvBlob.url,
      defect_count: stats.total,
      completed_count: stats.completedThisWeek,
      active_count: stats.active,
    });

    // Purge images older than 7 days from Blob (skip base64 data URLs)
    const toBePurged = allDefects.filter((d) => {
      if (d.status !== 'Completed' || d.images_purged || !d.completed_at) return false;
      const t = d.completed_at.toDate ? d.completed_at.toDate() : new Date(d.completed_at);
      return t < sevenDaysAgo;
    });

    let purgedCount = 0;
    for (const d of toBePurged) {
      const blobUrls = [d.before_picture_url, d.after_picture_url]
        .filter((u) => u && u.startsWith('https://'));
      await Promise.all(blobUrls.map((u) => del(u).catch(() => {})));
      await db.collection('defects').doc(d.id).update({
        before_picture_url: null,
        after_picture_url: null,
        images_purged: true,
      });
      purgedCount++;
    }

    res.json({
      ok: true,
      week: weekLabel,
      completedThisWeek: completedThisWeek.length,
      purgedImages: purgedCount,
    });
  } catch (err) {
    console.error('Cron error:', err);
    res.status(500).json({ error: err.message });
  }
};
