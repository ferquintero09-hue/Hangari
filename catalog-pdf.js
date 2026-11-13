/* Catálogo navideño Hangari · PDF dinámico desde los productos vigentes. */
(function () {
  "use strict";
  const A4_W = 210, A4_H = 297;
  const SITE = "https://ferquintero09-hue.github.io/Hangari/";
  const WHATSAPP = "https://wa.me/message/HGBG62DYCRBON1";
  const COLORS = {
    ink: "#29221B", cocoa: "#3B2D23", dark: "#1C1916",
    gold: "#C5A36B", pale: "#E9D7B5", cream: "#FBF7F0",
    white: "#FFFFFF", muted: "#766A5A", line: "#E9E0D4"
  };
  const CATEGORIES = ["Proteínas", "Ensaladas", "Platos", "Novenitas"];
  const imageCache = new Map();
  let libPromise = null;

  function rgb(hex) {
    const v = hex.replace("#", "");
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function fill(doc, color) { doc.setFillColor.apply(doc, rgb(color)); }
  function stroke(doc, color) { doc.setDrawColor.apply(doc, rgb(color)); }
  function color(doc, value) { doc.setTextColor.apply(doc, rgb(value)); }
  function clean(value) {
    return String(value == null ? "" : value)
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/[–—]/g, "-").replace(/[\u2022\u2023]/g, "-")
      .replace(/\s+/g, " ").trim();
  }
  function cop(value) {
    return "$" + Number(value || 0).toLocaleString("es-CO", {
      maximumFractionDigits: 0
    });
  }
  function presentation(item) {
    if (item.category === "Proteínas" || item.category === "Ensaladas") {
      return Number(item.base_weight_kg || 1).toLocaleString("es-CO", {
        maximumFractionDigits: 2
      }) + " kg";
    }
    return clean(item.unit || "Por unidad");
  }
  function fileImage(path) {
    const src = String(path || "").trim();
    if (!src) return "";
    if (/^https?:\/\//i.test(src)) return src;
    return encodeURI("img/productos/" + src.replace(/^[.\/\\]+/, ""));
  }
  function loadScript() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "vendor/jspdf.umd.min.js?v=2.5.2";
      script.async = true;
      script.onload = function () {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error("La biblioteca PDF no está disponible."));
      };
      script.onerror = function () {
        reject(new Error("No fue posible cargar el generador PDF de Hangari. Actualiza la página e inténtalo de nuevo."));
      };
      document.head.appendChild(script);
    }).catch(function (error) { libPromise = null; throw error; });
    return libPromise;
  }
  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      const image = new Image();
      if (/^https?:\/\//i.test(src)) image.crossOrigin = "anonymous";
      let finished = false;
      const stop = function (result) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const timeout = setTimeout(function () { stop(null); }, 10000);
      image.onload = function () { stop(image); };
      image.onerror = function () { stop(null); };
      image.src = src;
    });
  }
  async function jpegCover(src, width, height) {
    if (!src) return null;
    const key = src + "|" + width + "x" + height;
    if (imageCache.has(key)) return imageCache.get(key);
    const image = await loadImage(src);
    if (!image || !image.naturalWidth || !image.naturalHeight) {
      imageCache.set(key, null);
      return null;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("No hay lienzo disponible.");
      ctx.fillStyle = COLORS.cream;
      ctx.fillRect(0, 0, width, height);
      const w = image.naturalWidth, h = image.naturalHeight;
      const desired = width / height, source = w / h;
      let sx = 0, sy = 0, sw = w, sh = h;
      if (source > desired) {
        sw = h * desired;
        sx = (w - sw) / 2;
      } else {
        sh = w / desired;
        sy = (h - sh) / 2;
      }
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
      const data = canvas.toDataURL("image/jpeg", 0.76);
      imageCache.set(key, data);
      return data;
    } catch (error) {
      console.warn("Hangari: no se pudo incluir la imagen del PDF.", src, error);
      imageCache.set(key, null);
      return null;
    }
  }
  async function jpegContain(src, width, height, background) {
    const image = await loadImage(src);
    if (!image) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      const w = image.naturalWidth, h = image.naturalHeight;
      const scale = Math.min(width * 0.91 / w, height * 0.91 / h);
      ctx.drawImage(image, (width - w * scale) / 2, (height - h * scale) / 2, w * scale, h * scale);
      return canvas.toDataURL("image/jpeg", 0.82);
    } catch (_) { return null; }
  }
  function drawText(doc, text, x, y, maxWidth, maxLines, size, style, ink, lineFactor) {
    doc.setFont("helvetica", style || "normal");
    doc.setFontSize(size);
    color(doc, ink || COLORS.ink);
    let lines = doc.splitTextToSize(clean(text), maxWidth);
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:\s]+$/, "") + "...";
    }
    doc.text(lines, x, y, { lineHeightFactor: lineFactor || 1.17 });
    return lines.length;
  }
  async function coverPage(doc, count, onProgress) {
    fill(doc, COLORS.dark); doc.rect(0, 0, A4_W, A4_H, "F");
    fill(doc, COLORS.gold); doc.rect(0, 0, A4_W, 5, "F");
    stroke(doc, COLORS.gold); doc.setLineWidth(0.5);
    doc.line(17, 77, 193, 77);
    const logo = await jpegContain("img/logo-color.png", 320, 320, COLORS.dark);
    if (logo) doc.addImage(logo, "JPEG", 89, 11, 32, 32);
    doc.setFont("helvetica", "bold"); doc.setFontSize(19); color(doc, COLORS.pale);
    doc.text("HANGARI", 105, 56, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11); color(doc, COLORS.gold);
    doc.text("CATÁLOGO NAVIDEÑO", 105, 70, { align: "center" });
    drawText(doc, "Sabores para", 20, 92, 175, 1, 30, "normal", COLORS.white);
    drawText(doc, "compartir.", 20, 107, 175, 1, 34, "bold", COLORS.gold);
    if (onProgress) onProgress("Preparando portada...");
    const cover = await jpegCover("img/portada/portada.jpg", 1200, 680);
    fill(doc, COLORS.gold); doc.roundedRect(17, 125, 176, 113, 4, 4, "F");
    if (cover) doc.addImage(cover, "JPEG", 20, 128, 170, 107);
    else {
      fill(doc, COLORS.cocoa); doc.roundedRect(20, 128, 170, 107, 3, 3, "F");
      drawText(doc, "Navidad para compartir", 39, 181, 132, 2, 20, "bold", COLORS.cream);
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(12); color(doc, COLORS.cream);
    doc.text("Un menú hecho para reunirnos alrededor de la mesa.", 105, 255, { align: "center" });
    doc.setFontSize(10); color(doc, COLORS.gold);
    doc.text(count + " preparaciones para disfrutar", 105, 267, { align: "center" });
    stroke(doc, COLORS.gold); doc.line(47, 279, 163, 279);
    doc.setFontSize(9); color(doc, COLORS.pale);
    doc.text("ferquintero09-hue.github.io/Hangari", 105, 288, { align: "center" });
  }
  function sectionHead(doc, category, part, count) {
    fill(doc, COLORS.cream); doc.rect(0, 0, A4_W, A4_H, "F");
    fill(doc, COLORS.dark); doc.rect(0, 0, A4_W, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); color(doc, COLORS.gold);
    doc.text("HANGARI  /  MENÚ NAVIDEÑO", 14, 17);
    doc.setFont("helvetica", "bold"); doc.setFontSize(24); color(doc, COLORS.ink);
    doc.text(clean(category), 14, 31);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); color(doc, COLORS.muted);
    const caption = part > 1 ? "Continuación  /  " + count + " referencias en esta sección" : count + " preparaciones en esta sección";
    doc.text(caption, 14, 38);
    stroke(doc, COLORS.gold); doc.setLineWidth(0.6); doc.line(14, 41, 196, 41);
  }
  async function productCard(doc, item, index, top) {
    const col = index % 2;
    const x = 14 + col * 96, y = top, w = 86, h = 112;
    fill(doc, COLORS.white); stroke(doc, COLORS.line);
    doc.setLineWidth(0.35); doc.roundedRect(x, y, w, h, 4, 4, "FD");
    const photo = await jpegCover(fileImage(item.image_url), 750, 460);
    if (photo) doc.addImage(photo, "JPEG", x + 2, y + 2, w - 4, 50);
    else {
      fill(doc, COLORS.pale); doc.roundedRect(x + 2, y + 2, w - 4, 50, 2, 2, "F");
      drawText(doc, "HANGARI", x + 24, y + 28, w - 26, 1, 16, "bold", COLORS.cocoa);
    }
    drawText(doc, item.name, x + 4, y + 60, w - 8, 2, 11.2, "bold", COLORS.ink, 1.08);
    drawText(doc, item.description || "", x + 4, y + 73, w - 8, 4, 7.9, "normal", COLORS.muted, 1.18);
    stroke(doc, COLORS.line); doc.setLineWidth(0.25); doc.line(x + 4, y + 96, x + w - 4, y + 96);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); color(doc, COLORS.cocoa);
    doc.text(cop(item.price), x + 4, y + 106);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.4); color(doc, COLORS.muted);
    doc.text(presentation(item), x + w - 4, y + 105, { align: "right" });
  }
  async function categoryPages(doc, category, items, onProgress) {
    let part = 0;
    for (let start = 0; start < items.length; start += 4) {
      part++;
      doc.addPage();
      sectionHead(doc, category, part, items.length);
      const batch = items.slice(start, start + 4);
      for (let i = 0; i < batch.length; i++) {
        if (onProgress) onProgress("Incluyendo " + clean(batch[i].name) + "...");
        await productCard(doc, batch[i], i, i < 2 ? 45 : 168);
      }
    }
  }
  async function lastPage(doc, count) {
    doc.addPage();
    fill(doc, COLORS.dark); doc.rect(0, 0, A4_W, A4_H, "F");
    fill(doc, COLORS.gold); doc.rect(0, 0, A4_W, 5, "F");
    stroke(doc, COLORS.gold); doc.setLineWidth(0.55); doc.line(21, 47, 189, 47);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); color(doc, COLORS.gold);
    doc.text("HANGARI", 105, 36, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(25); color(doc, COLORS.white);
    doc.text("La mesa está lista.", 105, 71, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(13); color(doc, COLORS.pale);
    doc.text("Solo faltas tú.", 105, 85, { align: "center" });
    const qr = await jpegContain("img/qr-whatsapp.jpg", 480, 480, "#FFFFFF");
    fill(doc, COLORS.white); doc.roundedRect(72, 103, 66, 66, 5, 5, "F");
    if (qr) doc.addImage(qr, "JPEG", 76, 107, 58, 58);
    else {
      drawText(doc, "WHATSAPP", 82, 136, 45, 1, 12, "bold", COLORS.cocoa);
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); color(doc, COLORS.gold);
    doc.text("Haz tu pedido en línea", 105, 192, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); color(doc, COLORS.cream);
    doc.text("Explora los " + count + " productos y arma tu pedido en Hangari.", 105, 205, { align: "center" });
    fill(doc, COLORS.gold); doc.roundedRect(37, 223, 136, 18, 8, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); color(doc, COLORS.dark);
    doc.text("ABRIR TIENDA ONLINE", 105, 235, { align: "center" });
    doc.link(37, 223, 136, 18, { url: SITE });
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); color(doc, COLORS.pale);
    doc.text("O escanea el código para escribirnos por WhatsApp.", 105, 254, { align: "center" });
    doc.link(72, 103, 66, 66, { url: WHATSAPP });
    stroke(doc, COLORS.gold); doc.line(21, 275, 189, 275);
    doc.setFontSize(9); color(doc, COLORS.gold);
    doc.text("Navidad para compartir", 105, 286, { align: "center" });
  }
  async function create(products, onProgress) {
    if (!Array.isArray(products) || !products.length) {
      throw new Error("No hay productos activos para generar el catálogo.");
    }
    const Pdf = await loadScript();
    imageCache.clear();
    const doc = new Pdf({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    doc.setProperties({
      title: "Catálogo navideño Hangari",
      subject: "Menú y precios vigentes",
      author: "Hangari"
    });
    const ordered = products.slice();
    await coverPage(doc, ordered.length, onProgress);
    for (const category of CATEGORIES) {
      const entries = ordered.filter(function (item) { return item.category === category; });
      if (entries.length) await categoryPages(doc, category, entries, onProgress);
    }
    await lastPage(doc, ordered.length);
    const total = doc.internal.getNumberOfPages();
    for (let page = 2; page < total; page++) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); color(doc, COLORS.muted);
      doc.text("Precios en pesos colombianos  |  " + page + " / " + total, 196, 290, { align: "right" });
      doc.text("HANGARI", 14, 290);
    }
    if (onProgress) onProgress("Finalizando PDF...");
    return {
      blob: doc.output("blob"),
      filename: "Hangari-Catalogo-Navideno.pdf",
      pages: total,
      products: ordered.length
    };
  }
  function download(file) {
    if (!file || !file.blob) throw new Error("No se ha generado el catálogo PDF.");
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 45000);
  }
  window.HangariCatalogPdf = Object.freeze({ create: create, download: download });
})();