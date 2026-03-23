let dom = {};

const config = {
    DATA_FETCH_INTERVAL_MS: 10,
    MAX_DATA_POINTS: 300,
    TOAST_DURATION_MS: 3000,
    MAX_ADC_VALUE: 4095,
    VISUAL_Y_MAX: 1200,
    VISUAL_X_MAX_S: 3,
};

const state = {
    isMonitoring: false,
    amostrasProcessadas: 0, 
    realTimeData: [],
    dataForSaving: [],
    savedFiles: [],
    statistics: { currentADC: 0, totalSamples: 0 },
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
        connectionStatus: document.getElementById('connectionStatus'),
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

    config.MAX_DATA_POINTS = (config.VISUAL_X_MAX_S * 1000) / config.DATA_FETCH_INTERVAL_MS;

    requestAnimationFrame(animarGrafico);
    renderizarHistorico();
});

// ================================================================
// COMUNICAÇÃO COM O ESP32
// ================================================================

function buscarDadosRealTime() {
    if (!state.isMonitoring) return;

    fetch('/live_data')
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) processarAmostraRealTime(data); })
        .catch(() => {})
        .finally(() => setTimeout(buscarDadosRealTime, config.DATA_FETCH_INTERVAL_MS));
}

function processarAmostraRealTime(data) {
    if (!state.isMonitoring) return;

    state.amostrasProcessadas++;
    const tempoMatematicoMs = state.amostrasProcessadas * config.DATA_FETCH_INTERVAL_MS;

    const newPoint = {
        timestamp: tempoMatematicoMs,
        filtered: data.filtered || 0,
        raw: data.raw || 0
    };

    state.realTimeData.push(newPoint);
    state.dataForSaving.push(newPoint);
    state.statistics.currentADC = newPoint.filtered;

    if (state.realTimeData.length > config.MAX_DATA_POINTS) {
        state.realTimeData.shift();
    }

    const highlightClass = newPoint.filtered > 1000 || newPoint.filtered < 100 ? 'highlight-pulse' : '';
    dom.currentAmplitude.innerHTML = `<span class="${highlightClass}">${newPoint.filtered}</span> <span class="unit">ADC</span>`;
    dom.avgFrequency.innerHTML = `${(1000 / config.DATA_FETCH_INTERVAL_MS).toFixed(0)} <span class="unit">Hz</span>`;

    const ultimos = state.realTimeData.slice(-4).reverse();
    dom.dataTableBody.innerHTML = ultimos.map(d => {
        const ms = d.timestamp;
        const min = Math.floor(ms / 60000).toString().padStart(2, '0');
        const seg = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
        const mili = (ms % 1000).toString().padStart(3, '0');
        const timeStr = `${min}:${seg}.${mili}`;

        const destaqueLog = d.filtered > 1000 ? 'log-highlight' : '';
        return `<div class="log-entry">
                    <span class="log-time">${timeStr}</span>
                    <span style="color: #666; margin: 0 10px;">|</span>
                    <span class="log-amplitude ${destaqueLog}">${d.filtered} ADC</span>
                </div>`;
    }).join('');
}

// ================================================================
// LÓGICA DO GRÁFICO (CANVAS)
// ================================================================

function redimensionarCanvas() {
    const container = dom.signalChart.parentElement;
    dom.signalChart.width = container.clientWidth;
    dom.signalChart.height = Math.max(350, container.clientHeight - 50);
}

function desenharSinal(ctx, data, property, color, isFiltered = false) {
    const w = ctx.canvas.width;
    const h_plot = ctx.canvas.height - 40;
    const scaleY = h_plot / config.VISUAL_Y_MAX;
    const stepX = w / (config.MAX_DATA_POINTS - 1);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = isFiltered ? 3 : 1;
    ctx.shadowBlur = isFiltered ? 10 : 0;
    ctx.shadowColor = color;

    data.forEach((pt, i) => {
        const x = i * stepX;
        let y_mapped = pt[property] * scaleY;
        const y = h_plot - Math.min(y_mapped, h_plot);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });

    ctx.stroke();
    ctx.shadowBlur = 0;
}

function desenharEixos(ctx, w, h) {
    const divisiones = 5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.font = '10px Quicksand';

    
    ctx.textAlign = 'right';
    for (let i = 0; i <= divisiones; i++) {
        const y_pos = (h / divisiones) * i;
        ctx.beginPath();
        ctx.moveTo(0, y_pos);
        ctx.lineTo(w, y_pos);
        ctx.stroke();

        if (i < divisiones) ctx.fillText(`${Math.round(config.VISUAL_Y_MAX - (config.VISUAL_Y_MAX / divisiones) * i)}`, w - 20, y_pos + 10);
    }

    const tempoAtualS = state.amostrasProcessadas * (config.DATA_FETCH_INTERVAL_MS / 1000);
    const timeWindowS = config.VISUAL_X_MAX_S;
    const timeEnd = Math.max(timeWindowS, tempoAtualS);
    const timeStart = timeEnd - timeWindowS;

    for (let i = 0; i <= divisiones; i++) {
        const x_pos = (w / divisiones) * i;
        ctx.beginPath();
        ctx.moveTo(x_pos, 0);
        ctx.lineTo(x_pos, h);
        ctx.stroke();

        const tempoEixo = timeStart + (i / divisiones) * timeWindowS;

        if (i === divisiones) {
            ctx.textAlign = 'right';
            ctx.fillText(tempoEixo.toFixed(1) + "s", x_pos - 25, h + 15);
        } else if (i === 0) {
            ctx.textAlign = 'left';
            ctx.fillText(tempoEixo.toFixed(1) + "s", x_pos + 15, h + 15);
        } else {
            ctx.textAlign = 'center';
            ctx.fillText(tempoEixo.toFixed(1) + "s", x_pos, h + 15);
        }
    }

    ctx.textAlign = 'center';
    ctx.fillText("Tempo (s)", w / 2, h + 30);
}

function animarGrafico() {
    const ctx = dom.signalChart.getContext('2d');
    const w = dom.signalChart.width;
    const h = dom.signalChart.height - 40;

    ctx.clearRect(0, 0, w, dom.signalChart.height);
    desenharEixos(ctx, w, h);

    if (state.realTimeData.length < 2) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.font = '20px Quicksand';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando Fluxo de Dados do ESP32...', w / 2, h / 2);
    } else {
        desenharSinal(ctx, state.realTimeData, 'raw', 'skyblue', false);
        desenharSinal(ctx, state.realTimeData, 'filtered', '#FFD700', true);
    }
    requestAnimationFrame(animarGrafico);
}

// ================================================================
// CONTROLES DE INTERFACE E EXPORTAÇÃO
// ================================================================

function iniciarMonitoramento() {
    if (state.isMonitoring) return;
    state.isMonitoring = true;

    state.amostrasProcessadas = 0;

    state.realTimeData = [];
    state.dataForSaving = [];
    state.statistics = { currentADC: 0, totalSamples: 0 };
    atualizarUI(true);

    mostrarToast('✨ INICIANDO AQUISIÇÃO...');
    fetch('/start').catch(e => console.error(e));

    setTimeout(() => {
        buscarDadosRealTime();
        state.intervals.timer = setInterval(atualizarPainelTempo, 1000);
    }, 100);
}

function pararESalvar() {
    if (!state.isMonitoring) return;
    state.isMonitoring = false;
    clearInterval(state.intervals.timer);

    fetch('/stop').catch(e => console.error(e));

    atualizarUI(false);
    setTimeout(() => {
        if (state.dataForSaving.length === 0) {
            mostrarToast('Nenhum dado capturado para salvar.');
            return;
        }
        abrirModal();
    }, 100);
}

function atualizarPainelTempo() {
    const diffS = Math.floor(state.amostrasProcessadas * (config.DATA_FETCH_INTERVAL_MS / 1000));
    const m = Math.floor(diffS / 60).toString().padStart(2, '0');
    const s = (diffS % 60).toString().padStart(2, '0');
    dom.recordingTime.textContent = `${m}:${s}`;
}

function gerarEExportarCSV(nome) {
    const fileName = `${nome.replace(/[^a-z0-9]/gi, '_')}_EMG.csv`;
    const rows = state.dataForSaving.map(d => `${d.timestamp},${d.filtered},${d.raw}`).join('\n');
    const blob = new Blob(['TempoDaSessao(ms),AmplitudeFiltrada(ADC),AmplitudeBruta(ADC)\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    state.savedFiles.unshift({ nome: fileName, hora: new Date().toLocaleTimeString('pt-BR'), urlBlob: url, dados: state.dataForSaving.slice() });
    renderizarHistorico();
    mostrarToast(`ARQUIVO SALVO: ${fileName}`);
}

function abrirModal() {
    dom.saveModal.classList.add('show');
    dom.inputGroup.classList.add('hidden');
    dom.modalBody.querySelector('.modal-question').style.display = 'block';
    dom.modalBody.querySelector('.modal-buttons').style.display = 'flex';
    dom.fileName.value = `Sessao_${new Date().getHours()}h${new Date().getMinutes()}`;
}

function fecharModal() { dom.saveModal.classList.remove('show'); }

function mostrarInputNome() {
    dom.modalBody.querySelector('.modal-question').style.display = 'none';
    dom.modalBody.querySelector('.modal-buttons').style.display = 'none';
    dom.inputGroup.classList.remove('hidden');
    dom.fileName.focus();
}

function salvarArquivo() {
    const nome = dom.fileName.value.trim();
    if (!nome) return mostrarToast('⚠️ Digite um nome para o arquivo!');
    gerarEExportarCSV(nome);
    fecharModal();
}

function renderizarHistorico() {
    dom.fileHistoryBody.innerHTML = state.savedFiles.length === 0
        ? '<tr><td colspan="3" class="empty">Nenhum registro de sessão encontrado.</td></tr>'
        : state.savedFiles.map((f, i) => `<tr><td>${f.nome}</td><td class="text-secondary">${f.hora}</td><td><button onclick="baixarArquivo(${i})" class="download-link">BAIXAR</button></td></tr>`).join('');
}

function baixarArquivo(i) {
    if (!state.savedFiles[i]) return;
    const a = document.createElement('a');
    a.href = state.savedFiles[i].urlBlob;
    a.download = state.savedFiles[i].nome;
    a.click();
    mostrarToast(`📥 Download: ${state.savedFiles[i].nome}`);
}

function limparDados() {
    if (state.isMonitoring) return mostrarToast('⚠️ Pare a captura antes de limpar os dados!');

    state.realTimeData = [];
    state.dataForSaving = [];
    state.savedFiles = [];
    state.amostrasProcessadas = 0;

    dom.recordingTime.textContent = `00:00`;
    dom.dataTableBody.innerHTML = '';
    renderizarHistorico();
    mostrarToast('Dados e histórico limpos. Próxima captura começará do 0.0s');
}

function atualizarUI(isRecording) {
    dom.startBtn.classList.toggle('hidden', isRecording);
    dom.stopBtn.classList.toggle('hidden', !isRecording);
    dom.connectionStatus.classList.toggle('active', isRecording);
}

function mostrarToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.add('show');
    setTimeout(() => dom.toast.classList.remove('show'), config.TOAST_DURATION_MS);
}