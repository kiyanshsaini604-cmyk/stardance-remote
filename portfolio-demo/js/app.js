// ═══════════════════════════════════════════
// STARDANCE PORTFOLIO — JAVASCRIPT
// ═══════════════════════════════════════════

// ─── Particle System ───
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let particles = [];
let mouse = { x: 0, y: 0 };

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function createParticles() {
  const count = Math.min(100, Math.floor(window.innerWidth / 10));
  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.2
    });
  }
}

function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0) p.x = canvas.width;
    if (p.x > canvas.width) p.x = 0;
    if (p.y < 0) p.y = canvas.height;
    if (p.y > canvas.height) p.y = 0;

    // Mouse interaction
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 150) {
      const force = (150 - dist) / 150;
      p.x += (dx / dist) * force * 2;
      p.y += (dy / dist) * force * 2;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 210, 255, ${p.opacity})`;
    ctx.fill();
  }

  // Draw connections
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(0, 180, 255, ${0.1 * (1 - dist / 100)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  requestAnimationFrame(drawParticles);
}

window.addEventListener('resize', () => {
  resizeCanvas();
  createParticles();
});

window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

resizeCanvas();
createParticles();
drawParticles();

// ─── Scroll Animations ───
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      if (entry.target.classList.contains('skill-item')) {
        const fill = entry.target.querySelector('.skill-fill');
        if (fill) {
          const width = fill.dataset.width;
          fill.style.width = '0%';
          setTimeout(() => { fill.style.width = width + '%'; }, 100);
        }
      }
      if (entry.target.classList.contains('hero-stat')) {
        const num = entry.target.querySelector('.stat-num');
        if (num) {
          const count = parseInt(num.dataset.count);
          animateCounter(num, count);
        }
      }
    }
  });
}, observerOptions);

document.querySelectorAll('.feature-card, .project-card, .skill-item, .stat').forEach(el => {
  observer.observe(el);
});

// ─── Counter Animation ───
function animateCounter(el, target) {
  let current = 0;
  const increment = target / 30;
  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      el.textContent = target;
      clearInterval(timer);
    } else {
      el.textContent = Math.floor(current);
    }
  }, 30);
}

// ─── Mobile Nav ───
const hamburger = document.getElementById('hamburger');
let menuOpen = false;

if (hamburger) {
  hamburger.addEventListener('click', () => {
    menuOpen = !menuOpen;
    const links = document.querySelector('.nav-links');
    if (menuOpen) {
      links.style.display = 'flex';
      links.style.flexDirection = 'column';
      links.style.position = 'absolute';
      links.style.top = '60px';
      links.style.right = '1rem';
      links.style.background = 'rgba(2,10,18,0.95)';
      links.style.padding = '1rem';
      links.style.border = '1px solid rgba(0,180,255,0.2)';
      links.style.gap = '1rem';
      links.style.alignItems = 'flex-end';
    } else {
      links.style.display = '';
      links.style.flexDirection = '';
      links.style.position = '';
      links.style.top = '';
      links.style.right = '';
      links.style.background = '';
      links.style.padding = '';
      links.style.border = '';
      links.style.gap = '';
      links.style.alignItems = '';
    }
  });
}

// Close mobile menu on link click
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    if (menuOpen) {
      menuOpen = false;
      const links = document.querySelector('.nav-links');
      links.style.display = '';
      links.style.flexDirection = '';
      links.style.position = '';
      links.style.top = '';
      links.style.right = '';
      links.style.background = '';
      links.style.padding = '';
      links.style.border = '';
      links.style.gap = '';
      links.style.alignItems = '';
    }
  });
});

// ─── Contact Form ───
function handleContact(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.textContent = 'SENT ✓';
  btn.style.background = 'rgba(0,255,136,0.2)';
  btn.style.borderColor = 'rgba(0,255,136,0.4)';
  btn.style.color = '#00ff88';
  setTimeout(() => {
    btn.textContent = 'SEND MESSAGE ⟫';
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
    e.target.reset();
  }, 2500);
  return false;
}

// ─── Nav link active state ───
window.addEventListener('scroll', () => {
  const sections = document.querySelectorAll('section[id]');
  let current = '';
  sections.forEach(section => {
    const top = section.offsetTop - 100;
    if (window.scrollY >= top) {
      current = section.getAttribute('id');
    }
  });
  document.querySelectorAll('.nav-link').forEach(link => {
    link.style.color = '';
    link.style.borderBottomColor = 'transparent';
    if (link.getAttribute('href') === '#' + current) {
      link.style.color = 'var(--cyan)';
      link.style.borderBottomColor = 'var(--cyan)';
    }
  });
});
