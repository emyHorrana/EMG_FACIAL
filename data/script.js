let dom = {};

const config = {
    SAMPLE_INTERVAL_MS: 1,      // intervalo real entre amostras no ESP32 (1kHz - deve bater com INTERVALO_AMOSTRAGEM_US do firmware)
    MAX_DATA_POINTS: 300,
    TOAST_DURATION_MS: 3000,
    VISUAL_X_MAX_S: 3,
    WEBSOCKET_PORTA: 81,
    VISUAL_Y_MAX: 1200,         // escala vertical FIXA e compartilhada entre raw e filtered (ajuste se seu sinal ultrapassar isso)
};

const state = {
    isMonitoring: false,
    realTimeData: [],
    dataForSaving: [],
    savedFiles: [],
    statistics: { currentADC: 0, totalSamples: 0 },
    intervals: {},
    socketWs: null,

// -------------------- INSTRUMENTAÇÃO: MÉTRICAS DE DESEMPENHO --------------------
    intervalosFrame: [],        // intervalo (ms) entre frames WebSocket consecutivos, medido no navegador
    ultimoFrameWsEm: null,      // performance.now() do último frame WebSocket recebido
    proximoSeqEsperado: null,   // próximo número de sequência esperado (detecta lacunas na entrega)
    ultimoTempoMsReal: 0,       // timestamp real (do ESP32) da última amostra processada
    amostrasPerdidas: 0,        // lacunas detectadas na sequência recebida (deveria ficar ~0 com WebSocket)
    amostrasUtilizadas: 0       // total de amostras realmente processadas no navegador
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

    config.MAX_DATA_POINTS = (config.VISUAL_X_MAX_S * 1000) / config.SAMPLE_INTERVAL_MS;

    // Conecta o WebSocket já na carga da página (não só ao clicar em Iniciar), pra a conexão
    // já estar pronta quando a captura começar de verdade.
    conectarWebSocket();

    requestAnimationFrame(animarGrafico);
    renderizarHistorico();
});

// ================================================================
// COMUNICAÇÃO COM O ESP32
// ================================================================

function conectarWebSocket() {
    if (state.socketWs && (state.socketWs.readyState === WebSocket.OPEN || state.socketWs.readyState === WebSocket.CONNECTING)) {
        return;
    }

    // Conexão persistente: diferente do polling HTTP anterior, aqui não há handshake TCP
    // repetido a cada amostra — o ESP32 empurra os dados assim que os gera.
    state.socketWs = new WebSocket(`ws://${location.hostname}:${config.WEBSOCKET_PORTA}/`);

    state.socketWs.onmessage = (evento) => processarLoteWs(evento.data);

    state.socketWs.onclose = () => {
        if (state.isMonitoring) setTimeout(conectarWebSocket, 500);
    };

    state.socketWs.onerror = () => {};
}

function processarLoteWs(texto) {
    if (!state.isMonitoring) return;

    // INSTRUMENTAÇÃO: mede o intervalo entre frames recebidos (proxy de estabilidade da
    // entrega em tempo real, já que aqui não existe mais um round-trip requisição/resposta).
    const agora = performance.now();
    if (state.ultimoFrameWsEm !== null) {
        state.intervalosFrame.push(agora - state.ultimoFrameWsEm);
    }
    state.ultimoFrameWsEm = agora;

    const linhas = texto.split('\n');
    for (const linha of linhas) {
        if (!linha) continue;
        const partes = linha.split(',');
        if (partes.length < 4) continue;

        const seq = Number(partes[0]);
        const t = Number(partes[1]);
        const raw = Number(partes[2]);
        const filtered = Number(partes[3]);

        // INSTRUMENTAÇÃO: lacuna na sequência recebida = amostra que nunca chegou.
        // Com WebSocket isso deveria ficar em ~0 (a entrega é confiável e ordenada).
        if (state.proximoSeqEsperado !== null && seq > state.proximoSeqEsperado) {
            state.amostrasPerdidas += seq - state.proximoSeqEsperado;
        }
        state.proximoSeqEsperado = seq + 1;

        const newPoint = { timestamp: t, raw, filtered };
        state.realTimeData.push(newPoint);
        state.dataForSaving.push(newPoint);
        state.amostrasUtilizadas++;
        state.ultimoTempoMsReal = t;
    }

    if (state.realTimeData.length > config.MAX_DATA_POINTS) {
        state.realTimeData.splice(0, state.realTimeData.length - config.MAX_DATA_POINTS);
    }

    if (state.realTimeData.length === 0) return;

    const ultimoPonto = state.realTimeData[state.realTimeData.length - 1];
    state.statistics.currentADC = ultimoPonto.filtered;

    const highlightClass = ultimoPonto.filtered > 1000 || ultimoPonto.filtered < 100 ? 'highlight-pulse' : '';
    dom.currentAmplitude.innerHTML = `<span class="${highlightClass}">${ultimoPonto.filtered}</span> <span class="unit">ADC</span>`;

    // INSTRUMENTAÇÃO: frequência real medida (amostras úteis / tempo real decorrido no ESP32),
    // em vez de um valor fixo assumido — se cair abaixo de ~1000Hz, é sinal de perda/atraso real.
    const freqReal = state.ultimoTempoMsReal > 0
        ? (state.amostrasUtilizadas / (state.ultimoTempoMsReal / 1000))
        : 0;
    dom.avgFrequency.innerHTML = `${freqReal.toFixed(0)} <span class="unit">Hz</span>`;

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

function desenharSinal(ctx, data, property, color, isFiltered = false, maxValue = 1200) {
    const w = ctx.canvas.width;
    const h_plot = ctx.canvas.height - 40;
    const scaleY = h_plot / maxValue;
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



function desenharEixos(ctx, w, h, escala = 1200) {
    const divisiones = 5;



    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.font = '10px Quicksand';



    ctx.textAlign = 'right';

    // raw e filtered usam a MESMA escala (calculada a partir do maior valor real visto entre
    // as duas), então os números aqui valem igualmente para as duas linhas.
    const VISUAL_Y_MAX = escala;

    

    for (let i = 0; i <= divisiones; i++) {
        const y_pos = (h / divisiones) * i;

        

        ctx.beginPath();
        ctx.moveTo(0, y_pos);
        ctx.lineTo(w, y_pos);
        ctx.stroke();



        const adc_value = Math.round(VISUAL_Y_MAX - (VISUAL_Y_MAX / divisiones) * i);

        if (i < divisiones) { 

            ctx.fillText(`${adc_value}`, w - 5, y_pos + 10); 

        }

    }

    

    ctx.textAlign = 'center';

    

    const data = state.realTimeData;

    const temDados = data.length > 0;

    const timeWindowMS = config.VISUAL_X_MAX_S * 1000;

    

    let now;

    if (temDados) {

        now = data[data.length - 1].dateObj;

    }



    for (let i = 0; i <= divisiones; i++) {

        const x_pos = (w / divisiones) * i;

        

        ctx.beginPath();

        ctx.moveTo(x_pos, 0);

        ctx.lineTo(x_pos, h);

        ctx.stroke();



        let timeStr = "--:--";

        

        if (temDados && now) {

            const timeOffset = timeWindowMS * (1 - (i / divisiones));

            const gridTime = new Date(now.getTime() - timeOffset);

            timeStr = gridTime.toLocaleTimeString('pt-BR', { second: '2-digit' }) + 

                      ':' + String(gridTime.getMilliseconds()).padStart(3, '0').slice(0, 2);

        } else if (i === divisiones) {

            timeStr = "00:00";

        }



        ctx.fillText(timeStr, x_pos, h + 15);

    }

    

    ctx.fillText("Tempo (s:ms)", w / 2, h + 30);

}



function animarGrafico() {
    const ctx = dom.signalChart.getContext('2d');
    const w = dom.signalChart.width;
    const h = dom.signalChart.height - 40;

    ctx.clearRect(0, 0, w, dom.signalChart.height);
    desenharEixos(ctx, w, h, config.VISUAL_Y_MAX);

    if (state.realTimeData.length < 2) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.font = '20px Quicksand';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando Fluxo de Dados...', w / 2, h / 2);
    } else {
        // Escala FIXA e compartilhada entre as duas linhas (config.VISUAL_Y_MAX) — se o raw
        // ultrapassar isso, ele é cortado no topo (igual a um osciloscópio com fundo de escala fixo).
        desenharSinal(ctx, state.realTimeData, 'raw', 'skyblue', false, config.VISUAL_Y_MAX);
        desenharSinal(ctx, state.realTimeData, 'filtered', '#FFD700', true, config.VISUAL_Y_MAX);
    }
    requestAnimationFrame(animarGrafico);
}

// ================================================================
// CONTROLES DE INTERFACE E EXPORTAÇÃO
// ================================================================

function iniciarMonitoramento() {
    if (state.isMonitoring) return;
    state.isMonitoring = true;

    state.realTimeData = [];
    state.dataForSaving = [];
    state.statistics = { currentADC: 0, totalSamples: 0 };


    // INSTRUMENTAÇÃO: zera as métricas da sessão anterior antes de começar uma nova
    state.intervalosFrame = [];
    state.ultimoFrameWsEm = null;
    state.proximoSeqEsperado = null;
    state.ultimoTempoMsReal = 0;
    state.amostrasPerdidas = 0;
    state.amostrasUtilizadas = 0;

    atualizarUI(true);

    mostrarToast('✨ CAPTURANDO SINAL EMG...');

    // Garante que o WebSocket está conectado antes de mandar o ESP32 começar a transmitir
    // (senão as primeiras amostras seriam geradas sem ninguém do outro lado pra recebê-las).
    conectarWebSocket();

    setTimeout(() => {
        fetch('/start').catch(e => console.error("Falha ao enviar /start:", e));
        state.intervals.timer = setInterval(atualizarPainelTempo, 1000);
    }, 150);
}

function pararESalvar() {
    if (!state.isMonitoring) return;
    state.isMonitoring = false;
    clearInterval(state.intervals.timer);

    fetch('/stop').catch(e => console.error(e));

     // INSTRUMENTAÇÃO: mostra o resumo da sessão no console do navegador
    exibirResumoInstrumentacao();

    atualizarUI(false);
    setTimeout(() => {
        if (state.dataForSaving.length === 0) {
            mostrarToast('Nenhum dado capturado para salvar.');
            return;
        }
        abrirModal();
    }, 100);
}

// INSTRUMENTAÇÃO: resumo de performance da sessão que acabou de terminar.
// Use isto para distinguir "sinal ruim por interferência" de "sinal ruim por perda/atraso de amostras":
// se amostrasPerdidas ficar ~0, a entrega em tempo real está confiável.
function exibirResumoInstrumentacao() {
    const totalAmostras = state.amostrasUtilizadas + state.amostrasPerdidas;
    const percentPerdidas = totalAmostras > 0 ? (state.amostrasPerdidas / totalAmostras * 100) : 0;

    let intervaloMedio = 0, intervaloMin = 0, intervaloMax = 0;
    if (state.intervalosFrame.length > 0) {
        intervaloMedio = state.intervalosFrame.reduce((a, b) => a + b, 0) / state.intervalosFrame.length;
        intervaloMin = Math.min(...state.intervalosFrame);
        intervaloMax = Math.max(...state.intervalosFrame);
    }

    const freqReal = state.ultimoTempoMsReal > 0
        ? (state.amostrasUtilizadas / (state.ultimoTempoMsReal / 1000))
        : 0;

    console.log(
        `%c[EMG] Resumo da sessão`,
        'font-weight: bold;',
        `\n  Amostras utilizadas: ${state.amostrasUtilizadas}`,
        `\n  Amostras perdidas:   ${state.amostrasPerdidas} (${percentPerdidas.toFixed(2)}%)`,
        `\n  Frequência real:     ${freqReal.toFixed(0)} Hz`,
        `\n  Intervalo entre frames WS: média ${intervaloMedio.toFixed(1)}ms | min ${intervaloMin.toFixed(1)}ms | max ${intervaloMax.toFixed(1)}ms`,
        `\n  Duração real (ESP32): ${(state.ultimoTempoMsReal / 1000).toFixed(2)}s`
    );
}

function atualizarPainelTempo() {
    const diffS = Math.floor(state.ultimoTempoMsReal / 1000);
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



function atualizarCronometro() {

    if (!state.startTime) return;

    const diff = Math.floor((Date.now() - state.startTime) / 1000);

    const m = Math.floor(diff / 60).toString().padStart(2,'0');

    const s = (diff % 60).toString().padStart(2,'0');

    dom.recordingTime.textContent = `${m}:${s}`; 

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
    state.proximoSeqEsperado = null;
    state.ultimoTempoMsReal = 0;

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