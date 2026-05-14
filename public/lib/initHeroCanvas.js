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
      // Globe geometry
      const radius = 30;
      const segments = isMobile ? 32 : 64;
      const geometry = new THREE.SphereGeometry(radius, segments, segments);
      
      const material = new THREE.PointsMaterial({ 
        size: 0.3, 
        color: 0x00d1ff, 
        transparent: true, 
        opacity: 0.8, 
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      
      const globe = new THREE.Points(geometry, material);
      scene.add(globe);

      // Add some floating connection lines/particles around the globe
      const haloGeometry = new THREE.BufferGeometry();
      const haloParticles = isMobile ? 200 : 500;
      const positions = new Float32Array(haloParticles * 3);
      for (let i = 0; i < haloParticles; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const r = radius + 2 + Math.random() * 10;
        positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i*3+2] = r * Math.cos(phi);
      }
      haloGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const haloMaterial = new THREE.PointsMaterial({
        size: 0.5,
        color: 0xf5a623,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      });
      const halo = new THREE.Points(haloGeometry, haloMaterial);
      scene.add(halo);

      const onResize = () => {
        const w = container.clientWidth, h = container.clientHeight;
        camera.aspect = w/h; camera.updateProjectionMatrix();
        renderer.setSize(w,h);
      };
      window.addEventListener('resize', onResize);

      let t = 0;
      const animate = () => {
        t += 0.005;
        // Spin the globe
        globe.rotation.y += 0.002;
        globe.rotation.x = Math.sin(t) * 0.1;
        
        // Spin the halo
        halo.rotation.y -= 0.001;
        halo.rotation.z = Math.cos(t) * 0.1;
        
        // Gentle camera movement
        camera.position.x = Math.sin(t*0.5)*5;
        camera.position.y = Math.sin(t*0.3)*2;
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
