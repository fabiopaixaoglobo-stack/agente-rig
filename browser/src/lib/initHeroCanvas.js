import * as THREE from "three";

/**
 * Inicializa um canvas WebGL simples com partículas/nós e parallax.
 * Fallbacks devem ser tratados no CSS/HTML (imagem estática).
 */
export default function initHeroCanvas(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Limpa conteúdo anterior
  container.innerHTML = "";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, 0, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  // Luz ambiente
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  // Partículas (nós)
  const pointsGeo = new THREE.BufferGeometry();
  const count = 300;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * 12;
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pointsMat = new THREE.PointsMaterial({ color: 0x00d1ff, size: 0.04, transparent: true, opacity: 0.9 });
  const points = new THREE.Points(pointsGeo, pointsMat);
  scene.add(points);

  // Linhas sutis entre alguns pontos (simulação de conexões)
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff8a00, transparent: true, opacity: 0.08 });
  const lineGeo = new THREE.BufferGeometry();
  const linePositions = new Float32Array(300 * 3);
  for (let i = 0; i < linePositions.length; i++) linePositions[i] = (Math.random() - 0.5) * 12;
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lines);

  // Animação de pulso simples
  let pulse = 0;
  function animate() {
    requestAnimationFrame(animate);
    pulse += 0.02;
    const glow = (Math.sin(pulse) + 1) / 2;
    points.material.opacity = 0.6 + glow * 0.4;
    points.rotation.y += 0.0008;
    points.rotation.x += 0.0003;
    renderer.render(scene, camera);
  }
  animate();

  // Parallax mouse
  let mouseX = 0, mouseY = 0;
  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
    camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.05;
  });

  // Resize handler
  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
}
