import { gsap } from 'gsap'

document.addEventListener('DOMContentLoaded', () => {
  // Hero entry animation
  gsap.from('#hero-card', {
    duration: 1.2,
    y: 40,
    opacity: 0,
    ease: 'power3.out',
  })

  // Badges staggered entrance
  gsap.from('.badge-item', {
    duration: 0.8,
    scale: 0.7,
    opacity: 0,
    stagger: 0.15,
    delay: 0.3,
    ease: 'back.out(1.7)',
  })

  // Interactive animation button
  const animateBtn = document.getElementById('animate-btn')
  if (animateBtn) {
    animateBtn.addEventListener('click', () => {
      gsap.timeline()
        .to('#hero-card', {
          scale: 1.03,
          duration: 0.2,
          yoyo: true,
          repeat: 1,
          ease: 'power1.inOut',
        })
        .to('.badge-item', {
          rotation: 360,
          duration: 0.8,
          stagger: 0.1,
          ease: 'circ.out',
        }, '<')
    })
  }
})
