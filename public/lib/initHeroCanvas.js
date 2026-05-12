// browser/src/lib/initHeroCanvas.js
export default function initHeroCanvas(containerId = 'hero-webgl') {
  try {
    const container = document.getElementById(containerId);
    if (!container) return;
    const loadThree = async () => {
      if (window.THREE) return window.THREE;
      try {
        const m = await import('https://unpkg.com/three@0.158.0/build/three.module.js');
        window.THREE = m;
        return m;
      } catch (err) {
        console.warn('Failed to load three.js from CDN, attempting to use fallback image/style.', err);
        throw err;
      }
    };

    let renderer, scene, camera, animationId;
    const start = async () => {
      let THREE;
      try {
        THREE = await loadThree();
      } catch (e) {
        // Fallback: apply a subtle fallback background to the container if WebGL fails
        container.style.background = 'url("/assets/hero-fallback.jpg") center/cover no-repeat';
        container.style.opacity = '0.4';
        return;
      }

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
      camera.position.set(0, 0, 60);

      // Reduce count on mobile devices
      const isMobile = window.innerWidth < 768;
      const maxParticles = isMobile ? 400 : 1200;
      const count = Math.min(maxParticles, Math.floor((container.clientWidth * container.clientHeight) / (isMobile ? 12000 : 8000)));
      
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const speeds = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        positions[i*3+0] = (Math.random()-0.5)*120;
        positions[i*3+1] = (Math.random()-0.5)*60;
        positions[i*3+2] = (Math.random()-0.5)*200;
        speeds[i] = 0.2 + Math.random()*1.2;
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

      const material = new THREE.PointsMaterial({ size: 0.8, color: 0x00d1ff, transparent: true, opacity: 0.9, depthWrite: false });
      const particles = new THREE.Points(geometry, material);
      scene.add(particles);

      const onResize = () => {
        const w = container.clientWidth, h = container.clientHeight;
        camera.aspect = w/h; camera.updateProjectionMatrix();
        renderer.setSize(w,h);
      };
      window.addEventListener('resize', onResize);

      let t = 0;
      const animate = () => {
        t += 0.01;
        const pos = geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
          const idx = i*3;
          pos[idx+2] += Math.sin(t * speeds[i]) * 0.12 * speeds[i];
          pos[idx+0] += Math.cos(t * speeds[i] * 0.3) * 0.02;
          if (pos[idx+2] > 120) pos[idx+2] = -120;
        }
        geometry.attributes.position.needsUpdate = true;
        camera.position.x = Math.sin(t*0.2)*6;
        camera.position.y = Math.sin(t*0.1)*2;
        camera.lookAt(0,0,0);
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };
      animate();
    };

    start();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (renderer && renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      window.removeEventListener('resize', () => {});
    };
  } catch (e) {
    console.warn('initHeroCanvas falhou', e);
  }
}
