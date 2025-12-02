function initMouseGlow() {
    const cursorGlow = document.querySelector('.cursor-glow');
    if (!cursorGlow) return;
    
    document.addEventListener('mousemove', (e) => {
        cursorGlow.style.left = `${e.clientX}px`;
        cursorGlow.style.top = `${e.clientY}px`;
    });
}

function animateHeader() {
    const titleElement = document.getElementById('main-title');
    if (!titleElement) return;
    
    const fullText = 'MONITOR DE SORRISOS ✨';
    let currentText = '';
    let charIndex = 0;
    let isDeleting = false;
    
    titleElement.textContent = '';
    
    function typeEffect() {
        if (!isDeleting && charIndex < fullText.length) {
            currentText += fullText[charIndex];
            titleElement.textContent = currentText;
            charIndex++;
            setTimeout(typeEffect, 120);
        } else if (!isDeleting && charIndex >= fullText.length) {
            titleElement.style.textShadow = "0 0 25px rgba(255, 215, 0, 0.6)";
            setTimeout(() => {
                titleElement.style.textShadow = "none";
                isDeleting = true;
                typeEffect();
            }, 2000);
        } else if (isDeleting && charIndex > 0) {
            currentText = currentText.slice(0, -1);
            titleElement.textContent = currentText;
            charIndex--;
            setTimeout(typeEffect, 60);
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            setTimeout(typeEffect, 500);
        }
    }
    
    setTimeout(typeEffect, 300);
}

function initClock() {
    const clockElement = document.getElementById('clock');
    if (!clockElement) return;
    
    function updateClock() {
        const now = new Date();
        clockElement.textContent = now.toLocaleTimeString('pt-BR');
    }
    
    updateClock();
    setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
    initMouseGlow();
    animateHeader();
    initClock();
});
