figma.showUI(__html__, { width: 420, height: 520 });

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function rgbToHex(color) {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function matchesBgColor(frame, hex) {
  if (!hex) return true; // no filter
  if (!frame.fills || frame.fills.length === 0) return false;
  const fill = frame.fills[0];
  if (fill.type !== 'SOLID') return false;
  return rgbToHex(fill.color).toLowerCase() === hex.toLowerCase();
}

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'export') return;

  const opts = msg.opts;
  const page = figma.currentPage;
  let sections = [];

  try {
    // Determine sections
    if (opts.scope === 'currentPage' || opts.scope === 'allSections') {
      sections = page.findAll(n => n.type === 'SECTION');
    } else if (opts.scope === 'selectedSections') {
      sections = page.selection.filter(n => n.type === 'SECTION');
    }

    // Ungrouped frames fallback
    if (sections.length === 0) {
      const frames = page.findAll(n => n.type === 'FRAME' && n.parent === page);
      if (frames.length > 0) {
        sections.push({ name: 'Ungrouped', findAll: fn => frames.filter(fn) });
      }
    }

    const bgColor = opts.bgColor ? opts.bgColor.trim().toLowerCase() : '';
    const exportPromises = [];

    for (const section of sections) {
      const sectionName = sanitizeName(section.name || 'Untitled Section');
      const frames = section.findAll(n => n.type === 'FRAME');

      for (const frame of frames) {
        if (!matchesBgColor(frame, bgColor)) continue;

        exportPromises.push((async () => {
          try {
            const format = opts.format.toLowerCase();
            const bytes = await frame.exportAsync(
              format === 'svg' ? { format: 'SVG' } :
              format === 'pdf' ? { format: 'PDF' } :
              { format: format.toUpperCase(), constraint: { type: 'SCALE', value: opts.scale } }
            );
            const ext = format === 'jpg' ? 'jpg' : format === 'png' ? 'png' : format === 'svg' ? 'svg' : 'pdf';
            return { sectionName, frameName: sanitizeName(frame.name || 'Untitled Frame'), bytes, ext };
          } catch (err) {
            console.warn('Export failed for frame:', frame.name, err);
            return null;
          }
        })());
      }
    }

    // Run exports concurrently
    const results = await Promise.all(exportPromises);
    const files = results.filter(Boolean).map(e => ({
      sectionName: e.sectionName,
      frameName: e.frameName,
      data: Array.from(e.bytes),
      ext: e.ext
    }));

    // Return result to UI
    figma.ui.postMessage({ type: 'exports-ready', files });
  } catch (err) {
    console.error("Error during export:", err);
    figma.ui.postMessage({ type: 'exports-ready', files: [] });
  }
};
