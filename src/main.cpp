#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <LittleFS.h>
#include <math.h>

// -------------------- CONFIGURAÇÕES BÁSICAS --------------------
#define PINO_ANALOGICO_1 34     // Pino analógico utilizado para leitura do sinal
#define INTERVALO_AMOSTRAGEM_US 1000// Intervalo de amostragem em microssegundos (1 ms → 1000 Hz)
#define JANELA 10          // Tamanho da janela da média móvel

// -------------------- CONFIGURAÇÃO DOS FILTROS --------------------
#define FREQ_CORTE_PASSA_ALTA 20.0f  // Hz - remove deriva de linha de base e artefatos de movimento lento
#define FREQ_REDE_ELETRICA 60.0f     // Hz - frequência da rede elétrica local (60Hz no Brasil; troque para 50.0f se necessário)
#define Q_FILTRO_NOTCH 10.0f          // fator de qualidade do notch (maior = mais estreito/seletivo)

// -------------------- CONFIGURAÇÃO DO STREAMING EM TEMPO REAL --------------------
#define PORTA_WEBSOCKET 81
#define INTERVALO_ENVIO_WS_MS 5   // agrupa ~5ms de amostras por frame (reduz overhead sem atraso perceptível)

// Ligue isto (1) só para depuração pontual: imprimir a cada amostra (1kHz) a 115200 baud
// custa ~2.4ms por linha e sozinho já derruba a taxa real de amostragem para <500Hz.
// Com o WebSocket entregando os dados ao navegador, esse log deixou de ser necessário no dia a dia.
#define DEBUG_SERIAL_POR_AMOSTRA 0

// -------------------- CONFIGURAÇÃO DO WIFI (ACCESS POINT) --------------------
const char *nomeRede = "ESP32_AP";
const char *senhaRede = "12345678";

WebServer servidor(80);
WebSocketsServer webSocket(PORTA_WEBSOCKET);

// -------------------- VARIÁVEIS DO FILTRO DE MÉDIA MÓVEL --------------------
int bufferFiltro[JANELA];
long somaFiltro = 0;
int indiceFiltro = 0;
int contadorFiltro = 0;

// -------------------- VARIÁVEIS DO FILTRO PASSA-ALTA (remove deriva de linha de base) --------------------
float hpAlpha = 0.0f;
float hpXAnterior = 0.0f;
float hpYAnterior = 0.0f;

float filtroPassaAlta(float x0) {
    float y0 = hpAlpha * (hpYAnterior + x0 - hpXAnterior);
    hpXAnterior = x0;
    hpYAnterior = y0;
    return y0;
}

// -------------------- FILTRO NOTCH (biquad) - remove interferência da rede elétrica --------------------
struct FiltroBiquad {
    float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
    float x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    float processar(float x0) {
        float y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x0;
        y2 = y1; y1 = y0;
        return y0;
    }

    void resetar() {
        x1 = x2 = y1 = y2 = 0;
    }
};

FiltroBiquad filtroNotch;

void configurarFiltroNotch(FiltroBiquad &f, float freqCentral, float freqAmostragem, float Q) {
    float w0 = 2.0f * PI * freqCentral / freqAmostragem;
    float alpha = sinf(w0) / (2.0f * Q);
    float cosw0 = cosf(w0);
    float a0 = 1.0f + alpha;

    f.b0 = 1.0f / a0;
    f.b1 = (-2.0f * cosw0) / a0;
    f.b2 = 1.0f / a0;
    f.a1 = (-2.0f * cosw0) / a0;
    f.a2 = (1.0f - alpha) / a0;
}

// -------------------- VARIÁVEIS DE DADOS ATUAIS (TEMPO REAL) --------------------
uint32_t tempoAmostraAtual = 0;
uint16_t sinalBrutoAtual = 0;
uint16_t sinalFiltradoAtual = 0;

// -------------------- STREAMING EM TEMPO REAL (WEBSOCKET) --------------------
// Cada amostra recebe um número de sequência crescente. O navegador usa isso só para
// detectar lacunas (instrumentação) — diferente da versão anterior (polling HTTP), aqui
// não existe "pedir de novo": o WebSocket entrega tudo via TCP confiável e ordenado, numa
// única conexão persistente, sem o custo de handshake por requisição que limitava o polling
// a poucas centenas de Hz mesmo depois de otimizado.
uint32_t amostrasTotaisGeradas = 0;
String loteWs;
unsigned long ultimoEnvioWs = 0;

void aoEventoWebSocket(uint8_t num, WStype_t tipo, uint8_t *payload, size_t length) {
    if (tipo == WStype_CONNECTED) {
        Serial.printf("Cliente WebSocket #%u conectado\n", num);
    } else if (tipo == WStype_DISCONNECTED) {
        Serial.printf("Cliente WebSocket #%u desconectado\n", num);
    }
}

// -------------------- CONTROLE DE GRAVAÇÃO --------------------
bool gravando = false;
unsigned long tempoInicio = 0;
unsigned long tempoUltimaAmostra = 0;

// -------------------- FUNÇÕES DE SERVIÇO AUXILIAR --------------------

String obterTipoConteudo(String nomeArquivo) {
    if (nomeArquivo.endsWith(".htm") || nomeArquivo.endsWith(".html")) return "text/html";
    else if (nomeArquivo.endsWith(".css")) return "text/css";
    else if (nomeArquivo.endsWith(".js")) return "application/javascript";
    else if (nomeArquivo.endsWith(".json")) return "application/json";
    return "text/plain";
}

bool lerArquivo(String caminho) {
    if (caminho.endsWith("/")) caminho += "index.html";
    String tipoConteudo = obterTipoConteudo(caminho);
    File arquivo = LittleFS.open(caminho, "r");
    if (!arquivo) {
        Serial.println("Arquivo não encontrado: " + caminho);
        return false;
    }
    servidor.streamFile(arquivo, tipoConteudo);
    arquivo.close();
    return true;
}

// -------------------- ROTAS DO SERVIDOR --------------------

void iniciarCaptura() {
    if(!gravando){
        tempoInicio = millis();
        tempoUltimaAmostra = micros();
        amostrasTotaisGeradas = 0;
        loteWs = "";
        ultimoEnvioWs = millis();

        // Reinicia o estado dos filtros para a nova sessão não herdar o transiente da anterior
        hpXAnterior = 0;
        hpYAnterior = 0;
        filtroNotch.resetar();
        somaFiltro = 0;
        indiceFiltro = 0;
        contadorFiltro = 0;
        for (int i = 0; i < JANELA; i++) bufferFiltro[i] = 0;

        gravando = true;
        Serial.println("Captura em tempo real iniciada.");
    }
    servidor.send(200, "text/plain", "Captura iniciada.");
}

void pararCaptura() {
    gravando = false;
    if (loteWs.length() > 0) {
        webSocket.broadcastTXT(loteWs);
        loteWs = "";
    }
    Serial.println("Captura em tempo real parada.");
    servidor.send(200, "text/plain", "Captura parada.");
}

// -------------------- FUNÇÃO DE FILTRAGEM (MÉDIA MÓVEL) --------------------
int mediaMovel(int novoValor) {

    somaFiltro -= bufferFiltro[indiceFiltro];

    bufferFiltro[indiceFiltro] = novoValor;

    somaFiltro += novoValor;

    indiceFiltro = (indiceFiltro + 1) % JANELA;

    if (contadorFiltro < JANELA) contadorFiltro++;

    return somaFiltro / contadorFiltro;
}

// -------------------- CONFIGURAÇÃO INICIAL --------------------

void setup() {

    Serial.begin(115200);
    analogSetAttenuation(ADC_11db);
    delay(1000);

    if (!LittleFS.begin()) {
        Serial.println("Erro ao montar LittleFS!");
        return;
    }

    loteWs.reserve(320);

    // -------------------- CÁLCULO DOS COEFICIENTES DOS FILTROS --------------------
    float freqAmostragemHz = 1000000.0f / INTERVALO_AMOSTRAGEM_US;

    float rc = 1.0f / (2.0f * PI * FREQ_CORTE_PASSA_ALTA);
    float dt = INTERVALO_AMOSTRAGEM_US / 1000000.0f;
    hpAlpha = rc / (rc + dt);

    configurarFiltroNotch(filtroNotch, FREQ_REDE_ELETRICA, freqAmostragemHz, Q_FILTRO_NOTCH);

    WiFi.softAP(nomeRede, senhaRede);

    servidor.onNotFound([]() {
        if (!lerArquivo(servidor.uri())) {
            servidor.send(404, "text/plain", "Arquivo não encontrado");
        }
    });
    servidor.on("/favicon.ico", []() { servidor.send(204); });

    servidor.on("/start", iniciarCaptura);
    servidor.on("/stop", pararCaptura);

    servidor.begin();
    Serial.println("Servidor HTTP iniciado");

    webSocket.begin();
    webSocket.onEvent(aoEventoWebSocket);
    Serial.printf("Servidor WebSocket iniciado na porta %d\n", PORTA_WEBSOCKET);
}

// -------------------- LOOP PRINCIPAL --------------------
void loop() {
    servidor.handleClient();
    webSocket.loop();

    unsigned long agora_us = micros();

    if(agora_us - tempoUltimaAmostra >= INTERVALO_AMOSTRAGEM_US){
        tempoUltimaAmostra = agora_us;

        int leitura = analogRead(PINO_ANALOGICO_1);

        // -------------------- CADEIA DE FILTROS --------------------
        // 1) Passa-alta (~20Hz): remove deriva de linha de base e artefatos de movimento lento
        float sinalPassaAlta = filtroPassaAlta((float) leitura);
        // 2) Notch (50/60Hz): remove interferência da rede elétrica
        float sinalSemRede = filtroNotch.processar(sinalPassaAlta);
        // 3) Retifica (envelope linear) e suaviza com a média móvel existente
        int filtrado = mediaMovel((int) fabsf(sinalSemRede));

        tempoAmostraAtual = millis() - tempoInicio;
        sinalBrutoAtual = leitura;
        sinalFiltradoAtual = filtrado;

        if(gravando){
            loteWs += amostrasTotaisGeradas;
            loteWs += ',';
            loteWs += tempoAmostraAtual;
            loteWs += ',';
            loteWs += sinalBrutoAtual;
            loteWs += ',';
            loteWs += sinalFiltradoAtual;
            loteWs += '\n';
            amostrasTotaisGeradas++;

#if DEBUG_SERIAL_POR_AMOSTRA
            Serial.printf("T: %lu ms, B: %u, F: %u\n", tempoAmostraAtual, sinalBrutoAtual, sinalFiltradoAtual);
#endif
        }
    }

    if (gravando && loteWs.length() > 0 && (millis() - ultimoEnvioWs >= INTERVALO_ENVIO_WS_MS)) {
        webSocket.broadcastTXT(loteWs);
        loteWs = "";
        ultimoEnvioWs = millis();
    }
}
