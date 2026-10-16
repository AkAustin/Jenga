/**
 * Procedural wood grain & tabletop canvas generator for Three.js materials.
 * Generates 4 distinct natural hardwood shade variants so neighboring blocks
 * have crisp visual separation even when tightly stacked.
 */
window.JengaTextures = {
  createBlockCanvases() {
    const palettes = [
      { base: '#e8c89b', grain: '#cfa26b', brand: 'rgba(110, 68, 28, 0.34)' },
      { base: '#dfc092', grain: '#c4945a', brand: 'rgba(105, 62, 24, 0.34)' },
      { base: '#eed2a9', grain: '#d5a973', brand: 'rgba(118, 72, 30, 0.32)' },
      { base: '#d7b483', grain: '#bc8a50', brand: 'rgba(96, 56, 20, 0.36)' }
    ];

    return palettes.map((pal, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      // Base wood tone
      ctx.fillStyle = pal.base;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Fine horizontal wood grain streaks
      ctx.strokeStyle = pal.grain;
      for (let i = 0; i < 160; i++) {
        const y = Math.random() * canvas.height;
        ctx.lineWidth = 0.6 + Math.random() * 1.8;
        ctx.globalAlpha = 0.12 + Math.random() * 0.22;
        ctx.beginPath();
        ctx.moveTo(0, y);
        const wave = (Math.random() - 0.5) * 8;
        ctx.bezierCurveTo(
          canvas.width * 0.33, y + wave,
          canvas.width * 0.66, y - wave,
          canvas.width, y + (Math.random() - 0.5) * 4
        );
        ctx.stroke();
      }

      // Subtle bevel border so edges read crisply in 3D stack
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = '#6e4720';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

      // Subtle engraved "JENGA" stamp in the center
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.brand;
      ctx.font = '800 34px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('JENGA', canvas.width / 2, canvas.height / 2 + (idx % 2));

      return canvas;
    });
  },

  createTableCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 260);
    grad.addColorStop(0, '#3d2c1e');
    grad.addColorStop(0.75, '#281c13');
    grad.addColorStop(1, '#19110b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle concentric table ring & wood grain
    ctx.strokeStyle = 'rgba(235, 195, 140, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(256, 256, 195, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(256, 256, 130, 0, Math.PI * 2);
    ctx.stroke();

    return canvas;
  }
};
