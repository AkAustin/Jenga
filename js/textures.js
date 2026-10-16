/**
 * Photorealistic PBR Procedural Wood & Environment Texture Generator
 * Generates 3 distinct natural hardwood species (Maple/Birch, Honey Cherry/Oak, Dark Walnut),
 * realistic end-grain growth rings, bump/roughness maps, tabletop inlay, and parlor flooring.
 * Zero cartoon outlines.
 */
window.JengaTextures = {
  /**
   * Returns 3 distinct wood species texture sets:
   * Each entry has { sideCanvas, endCanvas, bumpCanvas }
   */
  createThreeWoodSpecies() {
    const species = [
      {
        name: 'Natural Maple',
        base: '#e5cca4',
        mid: '#d4b282',
        dark: '#b38b59',
        pore: 'rgba(95, 65, 35, 0.14)',
        stamp: 'rgba(92, 58, 26, 0.22)'
      },
      {
        name: 'Honey Cherry Oak',
        base: '#c98349',
        mid: '#b06932',
        dark: '#82461b',
        pore: 'rgba(58, 28, 10, 0.18)',
        stamp: 'rgba(55, 25, 8, 0.25)'
      },
      {
        name: 'American Walnut',
        base: '#6e4930',
        mid: '#573721',
        dark: '#3b2212',
        pore: 'rgba(24, 12, 5, 0.24)',
        stamp: 'rgba(220, 185, 140, 0.16)'
      }
    ];

    const bumpCanvas = this.createWoodBumpCanvas();

    return species.map((sp, idx) => {
      // 1. Long Side / Top Face Canvas (512 x 256)
      const sideCanvas = document.createElement('canvas');
      sideCanvas.width = 512;
      sideCanvas.height = 256;
      const ctx = sideCanvas.getContext('2d');

      // Smooth organic base gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, sideCanvas.height);
      bgGrad.addColorStop(0, sp.base);
      bgGrad.addColorStop(0.5, sp.mid);
      bgGrad.addColorStop(1, sp.base);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, sideCanvas.width, sideCanvas.height);

      // Subtle layered wood fibers
      for (let i = 0; i < 260; i++) {
        const y = Math.random() * sideCanvas.height;
        ctx.strokeStyle = i % 3 === 0 ? sp.dark : sp.mid;
        ctx.lineWidth = 0.4 + Math.random() * 1.4;
        ctx.globalAlpha = 0.05 + Math.random() * 0.13;
        ctx.beginPath();
        ctx.moveTo(0, y);
        const wave1 = (Math.random() - 0.5) * 10;
        const wave2 = (Math.random() - 0.5) * 10;
        ctx.bezierCurveTo(
          sideCanvas.width * 0.33,
          y + wave1,
          sideCanvas.width * 0.66,
          y + wave2,
          sideCanvas.width,
          y + (Math.random() - 0.5) * 5
        );
        ctx.stroke();
      }

      // Fine timber pores (short horizontal dashes)
      ctx.fillStyle = sp.pore;
      ctx.globalAlpha = 1;
      for (let p = 0; p < 350; p++) {
        const px = Math.random() * sideCanvas.width;
        const py = Math.random() * sideCanvas.height;
        const pw = 4 + Math.random() * 16;
        ctx.fillRect(px, py, pw, 0.8);
      }

      // Soft realistic chamfer shading at the very edges (no cartoon lines)
      const edgeVignette = ctx.createLinearGradient(0, 0, 0, sideCanvas.height);
      edgeVignette.addColorStop(0, 'rgba(0,0,0,0.16)');
      edgeVignette.addColorStop(0.06, 'rgba(255,255,255,0.06)');
      edgeVignette.addColorStop(0.94, 'rgba(255,255,255,0.04)');
      edgeVignette.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = edgeVignette;
      ctx.fillRect(0, 0, sideCanvas.width, sideCanvas.height);

      // Subtle debossed laser-etch on the long side
      ctx.fillStyle = sp.stamp;
      ctx.font = '700 26px "Inter", "Segoe UI", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('JENGA', sideCanvas.width / 2, sideCanvas.height / 2 + (idx - 1));

      // 2. End-Grain Canvas (128 x 128) with authentic concentric growth rings
      const endCanvas = document.createElement('canvas');
      endCanvas.width = 128;
      endCanvas.height = 128;
      const ectx = endCanvas.getContext('2d');
      ectx.fillStyle = sp.mid;
      ectx.fillRect(0, 0, 128, 128);

      const cx = 64 + (idx - 1) * 18;
      const cy = 110;
      for (let r = 8; r < 140; r += 4.5) {
        ectx.strokeStyle = r % 9 < 4.5 ? sp.dark : sp.base;
        ectx.lineWidth = 1.6;
        ectx.globalAlpha = 0.22;
        ectx.beginPath();
        ectx.arc(cx, cy, r, 0, Math.PI * 2);
        ectx.stroke();
      }
      ectx.globalAlpha = 0.12;
      ectx.fillStyle = '#000';
      ectx.fillRect(0, 0, 128, 128);

      return {
        name: sp.name,
        sideCanvas,
        endCanvas,
        bumpCanvas
      };
    });
  },

  createWoodBumpCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 256, 128);

    for (let i = 0; i < 300; i++) {
      const y = Math.random() * 128;
      ctx.strokeStyle = i % 2 === 0 ? '#969696' : '#6a6a6a';
      ctx.lineWidth = 0.7 + Math.random() * 1.2;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }
    return canvas;
  },

  createTableCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Rich satin mahogany/walnut tabletop with radial sunburst plank grain
    const grad = ctx.createRadialGradient(512, 512, 40, 512, 512, 512);
    grad.addColorStop(0, '#4a3221');
    grad.addColorStop(0.65, '#352215');
    grad.addColorStop(0.92, '#24160d');
    grad.addColorStop(1, '#180e08');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Fine wood grain lines across tabletop
    for (let i = 0; i < 420; i++) {
      const y = Math.random() * 1024;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(95, 62, 38, 0.14)' : 'rgba(25, 14, 7, 0.16)';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(340, y + (Math.random() - 0.5) * 14, 680, y + (Math.random() - 0.5) * 14, 1024, y);
      ctx.stroke();
    }

    // Subtle inlaid brass & maple tournament ring around the Jenga zone
    ctx.strokeStyle = 'rgba(218, 176, 118, 0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(512, 512, 230, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(218, 176, 118, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(512, 512, 410, 0, Math.PI * 2);
    ctx.stroke();

    return canvas;
  },

  createFloorCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#231811';
    ctx.fillRect(0, 0, 512, 512);

    // Parquet / plank lines
    const plankH = 64;
    for (let row = 0; row < 8; row++) {
      const y = row * plankH;
      ctx.fillStyle = row % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, y, 512, plankH);
      ctx.strokeStyle = 'rgba(10, 6, 3, 0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, y, 512, plankH);

      // Vertical plank joint
      const jointX = ((row * 173) % 400) + 50;
      ctx.beginPath();
      ctx.moveTo(jointX, y);
      ctx.lineTo(jointX, y + plankH);
      ctx.stroke();
    }

    // Fine grain
    for (let i = 0; i < 180; i++) {
      const y = Math.random() * 512;
      ctx.strokeStyle = 'rgba(70, 46, 28, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    return canvas;
  }
};
