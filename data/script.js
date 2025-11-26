let dom = {};
const config = {
    DATA_FETCH_INTERVAL_MS: 500,
    MAX_DATA_POINTS: 300,
    TOAST_DURATION_MS: 3000,
};

const state = {
    isMonitoring: false,
    startTime: null,
    realTimeData: [],
    savedFiles: [],
    statistics: { maxAmplitude: -Infinity, minAmplitude: Infinity, currentAmplitude: 0, avgFrequency: 0, totalSamples: 0, lastAmplitude: 0 },
    intervals: {}
};

addEventListener('DOMContentLoaded', () => {
    dom = {
        startBtn: document.getElementById('startBtn'),
        stopBtn: document.getElementById('stopBtn'),
        clearBtn: document.getElementById('clearBtn'),
        toast: document.getElementById('toast'),
        fileHistoryBody: document.getElementById('fileHistoryBody'),
        dataTableBody: document.getElementById('dataTableBody'),
        currentAmplitude: document.getElementById('currentAmplitude'),
        avgFrequency: document.getElementById('avgFrequency'),
        recordingTime: document.getElementById('recordingTime'),
        signalChart: document.getElementById('signalChart'),
        saveModal: document.getElementById('saveModal'),
        btnNo: document.getElementById('btnNo'),
        btnYes: document.getElementById('btnYes'),
        btnSave: document.getElementById('btnSave'),
        fileName: document.getElementById('fileName'),
        inputGroup: document.getElementById('inputGroup'),
        modalBody: document.getElementById('modalBody'),
    };

    dom.startBtn.addEventListener('click', iniciarMonitoramento);
    dom.stopBtn.addEventListener('click', pararESalvar);
    dom.clearBtn.addEventListener('click', limparDados);
    dom.btnNo.addEventListener('click', fecharModal);
    dom.btnYes.addEventListener('click', mostrarInputNome);
    dom.btnSave.addEventListener('click', salvarArquivo);
    dom.saveModal.addEventListener('click', (e) => {
        if (e.target === dom.saveModal) fecharModal();
    });

    redimensionarCanvas();
    window.addEventListener('resize', () => {
        clearTimeout(window.resizeTimeout);
        window.resizeTimeout = setTimeout(redimensionarCanvas, 200);
    });
    requestAnimationFrame(animarGrafico);
});

function iniciarMonitoramento() {
    if (state.isMonitoring) return;
    state.isMonitoring = true;
    state.startTime = Date.now();
    state.realTimeData = [];
    state.statistics = { maxAmplitude: -Infinity, minAmplitude: Infinity, currentAmplitude: 0, avgFrequency: 0, totalSamples: 0, lastAmplitude: 0 };
    
    atualizarUI(true);
    mostrarToast('✨ CAPTURANDO SORRISOS!');
    fetch('/start').catch(e => console.log("Simulação (Backend offline)"));

    state.intervals.fetch = setInterval(buscarDadosRealTime, config.DATA_FETCH_INTERVAL_MS);
    state.intervals.timer = setInterval(atualizarCronometro, 1000);
}

function pararESalvar() {
    if (!state.isMonitoring) return;
    state.isMonitoring = false;
    clearInterval(state.intervals.fetch);
    clearInterval(state.intervals.timer);
    fetch('/stop').catch(e => {});
    
    atualizarUI(false);

    setTimeout(() => {
        if (state.realTimeData.length === 0) {
            mostrarToast('Nenhum dado capturado.');
            return;
        }
        abrirModal();
    }, 100);
}

function abrirModal() {
    dom.saveModal.classList.add('show');
    dom.inputGroup.classList.add('hidden');
    dom.modalBody.querySelector('.modal-question').style.display = 'block';
    dom.modalBody.querySelector('.modal-buttons').style.display = 'flex';
    dom.fileName.value = `Smile_${new Date().getHours()}h${new Date().getMinutes()}`;
}

function fecharModal() {
    dom.saveModal.classList.remove('show');
}

function mostrarInputNome() {
    dom.modalBody.querySelector('.modal-question').style.display = 'none';
    dom.modalBody.querySelector('.modal-buttons').style.display = 'none';
    dom.inputGroup.classList.remove('hidden');
    dom.fileName.focus();
}

function salvarArquivo() {
    const nomeArquivo = dom.fileName.value.trim();
    if (!nomeArquivo) {
        mostrarToast('⚠️ Digite um nome para o arquivo!');
        return;
    }
    gerarEExportarCSV(nomeArquivo);
    fecharModal();
}

function buscarDadosRealTime() {
    fetch('/data').then(res => res.text()).then(data => processarLoteDados(data)).catch(err => {});
}

function processarLoteDados(csvData) {
    if (!csvData || !csvData.trim()) return;
    const lines = csvData.trim().split('\n').filter(line => line.includes(',') && !line.includes('Timestamp'));
    if (lines.length === 0) return;

    lines.forEach(line => {
        const [ts, ampStr, freqStr] = line.split(',');
        const amplitude = parseFloat(ampStr) || 0;
        const frequency = parseFloat(freqStr) || 0;
        const timestamp = parseInt(ts) || Date.now();

        state.realTimeData.push({ timestamp, amplitude, frequency, dateObj: new Date(timestamp * 1000) });
        
        state.statistics.currentAmplitude = amplitude;
        state.statistics.totalSamples++;
        state.statistics.avgFrequency = (state.statistics.avgFrequency + frequency) / 2;
    });

    if (state.realTimeData.length > config.MAX_DATA_POINTS) state.realTimeData = state.realTimeData.slice(-config.MAX_DATA_POINTS);
    
    const highlightClass = state.statistics.currentAmplitude > 0.5 ? 'style="color:#FFD700; text-shadow:0 0 15px #FFD700;"' : '';
    dom.currentAmplitude.innerHTML = `<span ${highlightClass}>${state.statistics.currentAmplitude.toFixed(2)}</span> <span class="unit">mV</span>`;
    dom.avgFrequency.innerHTML = `${state.statistics.avgFrequency.toFixed(1)} <span class="unit">Hz</span>`;
    
    const ultimos = state.realTimeData.slice(-4).reverse();
    dom.dataTableBody.innerHTML = ultimos.map(d => `
        <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem; font-family:monospace;">
            <span style="color:#9ca3af">${d.dateObj.toLocaleTimeString()}</span>
            <span style="color:${d.amplitude > 0.5 ? '#FFD700' : '#fff'}; font-weight:${d.amplitude > 0.5 ? 'bold' : 'normal'}">${d.amplitude.toFixed(2)} mV</span>
        </div>
    `).join('');
}

function gerarEExportarCSV(nomeUsuario) {
    const fileName = `${nomeUsuario.replace(/[^a-z0-9]/gi, '_')}.csv`;
    const header = 'Timestamp,DataHora,Amplitude(mV),Frequencia(Hz)\n';
    const rows = state.realTimeData.map(d => `${d.timestamp},${d.dateObj.toISOString()},${d.amplitude.toFixed(4)},${d.frequency.toFixed(2)}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    state.savedFiles.unshift({ nome: fileName, hora: new Date().toLocaleTimeString(), urlBlob: url, dados: state.realTimeData.slice() });
    renderizarHistorico();
    mostrarToast(`ARQUIVO SALVO: ${fileName}`);
}

function renderizarHistorico() {
    const tbody = dom.fileHistoryBody;
    if (state.savedFiles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty">Vamos capturar alguns sorrisos?</td></tr>';
        return;
    }
    tbody.innerHTML = state.savedFiles.map((f, index) => `
        <tr>
            <td>${f.nome}</td>
            <td style="color:#9ca3af">${f.hora}</td>
            <td><button onclick="baixarArquivo(${index})" class="download-link">BAIXAR</button></td>
        </tr>
    `).join('');
}

function baixarArquivo(index) {
    const arquivo = state.savedFiles[index];
    if (!arquivo) return;
    
    const link = document.createElement('a');
    link.href = arquivo.urlBlob;
    link.download = arquivo.nome;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    mostrarToast(`📥 Download: ${arquivo.nome}`);
}

function redimensionarCanvas() {
    const container = dom.signalChart.parentElement;
    dom.signalChart.width = container.clientWidth;
    dom.signalChart.height = container.clientHeight - 50;
}

function animarGrafico() {
    const ctx = dom.signalChart.getContext('2d');
    const w = dom.signalChart.width;
    const h = dom.signalChart.height;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);
    
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.1)';
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();

    if (state.realTimeData.length < 2) {
        requestAnimationFrame(animarGrafico); return;
    }

    ctx.beginPath();
    const data = state.realTimeData;
    const maxVal = 2.5;
    const scaleY = (h / 2) / maxVal;
    const stepX = w / (config.MAX_DATA_POINTS - 1);

    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(1, '#FF8C00');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    data.forEach((pt, i) => {
        const x = i * stepX;
        const y = cy - (pt.amplitude * scaleY);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    requestAnimationFrame(animarGrafico);
}

function atualizarUI(isRecording) {
    if (isRecording) {
        dom.startBtn.classList.add('hidden');
        dom.stopBtn.classList.remove('hidden');
    } else {
        dom.startBtn.classList.remove('hidden');
        dom.stopBtn.classList.add('hidden');
    }
}

function atualizarCronometro() {
    if (!state.startTime) return;
    const diff = Math.floor((Date.now() - state.startTime) / 1000);
    const m = Math.floor(diff / 60).toString().padStart(2,'0');
    const s = (diff % 60).toString().padStart(2,'0');
    dom.recordingTime.textContent = `00:${m}:${s}`;
}

function limparDados() {
    state.realTimeData = [];
    state.savedFiles = [];
    dom.dataTableBody.innerHTML = '';
    renderizarHistorico();
}

function mostrarToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    setTimeout(() => dom.toast.classList.remove('show'), 3000);
}
