#include <Arduino.h> 
#include <WiFi.h> 
#include <WebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h> // ADICIONADO: Para serializar a resposta JSON

// -------------------- CONFIGURAÇÕES BÁSICAS --------------------
#define ANALOG_PIN_1 34     // Pino analógico utilizado para leitura do sinal
#define SAMPLE_INTERVAL_US 1000// Intervalo de amostragem em microssegundos (1 ms → 1000 Hz)
#define WINDOW 10          // Tamanho da janela da média móvel

// -------------------- CONFIGURAÇÃO DO WIFI (ACCESS POINT) --------------------
const char *ssid = "ESP32_AP";  
const char *password = "12345678";

WebServer server(80); 

// -------------------- VARIÁVEIS DO FILTRO --------------------
int filtroBuffer[WINDOW]; 
long filtroSoma = 0;      
int filtroIndice = 0;      
int filtroCount = 0;

// -------------------- VARIÁVEIS DE DADOS ATUAIS (TEMPO REAL) --------------------
// Armazenam a última amostra lida, pronta para ser enviada via JSON
uint32_t currentSampleTime = 0;
uint16_t currentSignalRaw = 0;
uint16_t currentSignalFiltrado = 0;

// -------------------- CONTROLE DE GRAVAÇÃO --------------------
bool recording = false; // Flag que indica se a captura está ativa
unsigned long startTime = 0;        // Tempo em que a gravação começou
unsigned long lastSampleTime = 0;// Marca do tempo da última amostra coletada

// -------------------- FUNÇÕES DE SERVIÇO AUXILIAR --------------------
// Moveram-se para o topo para satisfazer a regra de declaração/definição do C++

// Retorna o tipo de conteúdo com base na extensão do arquivo solicitado
String getContentType(String filename) {
    if (filename.endsWith(".htm") || filename.endsWith(".html")) return "text/html";
    else if (filename.endsWith(".css")) return "text/css";
    else if (filename.endsWith(".js")) return "application/javascript";
    else if (filename.endsWith(".json")) return "application/json";
    return "text/plain";
}

// Lê um arquivo armazenado no LittleFS e envia ao navegador
bool handleFileRead(String path) {
    if (path.endsWith("/")) path += "index.html"; 
    String contentType = getContentType(path);
    File file = LittleFS.open(path, "r");
    if (!file) {
        Serial.println("Arquivo não encontrado: " + path);
        return false;
    }
    server.streamFile(file, contentType); 
    file.close();
    return true;
}

// -------------------- ROTAS DO SERVIDOR --------------------

// Inicia a captura em tempo real (rota /start)
void handleStart() {
    if(!recording){
        startTime = millis();
        lastSampleTime = micros();
        recording = true;
        Serial.println("Captura em tempo real iniciada.");
    }
    server.send(200, "text/plain", "Captura iniciada.");
}

// Para a captura em tempo real (rota /stop)
void handleStop() {
    recording = false; 
    Serial.println("Captura em tempo real parada.");
    server.send(200, "text/plain", "Captura parada.");
}

// Rota /live_data: Envia a última amostra em formato JSON (Resposta ao Polling)
void handleLiveData() {
    // Cria um objeto JSON estático (96 bytes é suficiente)
    StaticJsonDocument<96> doc; 
    char jsonBuffer[96]; // Buffer para armazenar a string JSON

    if (recording) {
        doc["time_ms"] = currentSampleTime;
        doc["raw"] = currentSignalRaw;
        doc["filtered"] = currentSignalFiltrado;
        
        // 1. Serializa o JSON para o buffer de caracteres
        size_t len = serializeJson(doc, jsonBuffer); 

        server.setContentLength(len); 

        server.send(200, "application/json", jsonBuffer); 
    } else {
        doc["status"] = "stopped";
        size_t len = serializeJson(doc, jsonBuffer);

        server.setContentLength(len);

        server.send(200, "application/json", jsonBuffer);
    }
}
// -------------------- FUNÇÃO DE FILTRAGEM (MÉDIA MÓVEL) --------------------
int mediaMovel(int novoValor) {
    // Subtrai o valor antigo do somatório
    filtroSoma -= filtroBuffer[filtroIndice];
    
    // Substitui o valor antigo pelo novo valor lido
    filtroBuffer[filtroIndice] = novoValor;
    
    // Soma o novo valor ao total
    filtroSoma += novoValor;

    // Atualiza o índice (circular)
    filtroIndice = (filtroIndice + 1) % WINDOW;

    // Atualiza o contador (apenas no início)
    if (filtroCount < WINDOW) filtroCount++;

    // Retorna a média
    return filtroSoma / filtroCount;
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
    
    WiFi.softAP(ssid, password);

    // Configura rotas HTTP
    server.onNotFound([]() {
        if (!handleFileRead(server.uri())) {
            server.send(404, "text/plain", "Arquivo não encontrado");
        }
    });
    server.on("/favicon.ico", []() { server.send(204); });

    server.on("/start", handleStart);
    server.on("/stop", handleStop);      
    server.on("/live_data", handleLiveData); 

    server.begin();
    Serial.println("Servidor HTTP iniciado");
}

// -------------------- LOOP PRINCIPAL --------------------
void loop() {
    server.handleClient(); // Mantém o servidor respondendo a requisições

    unsigned long now_us = micros();
    
    // LÓGICA DE AMOSTRAGEM CONTÍNUA:
    // Coleta nova amostra apenas quando o intervalo de 1ms for atingido
    if(now_us - lastSampleTime >= SAMPLE_INTERVAL_US){
        lastSampleTime = now_us;

        int leitura = analogRead(ANALOG_PIN_1);// Leitura do sinal bruto
        int filtrado = mediaMovel(leitura);     // Aplica o filtro

        // ATUALIZAÇÃO DAS VARIÁVEIS GLOBAIS DE ÚLTIMA LEITURA
        currentSampleTime = millis() - startTime; 
        currentSignalRaw = leitura;
        currentSignalFiltrado = filtrado;

        // Debug (só imprime se estiver gravando)
        if(recording){
            Serial.printf("T: %lu ms, B: %u, F: %u\n", currentSampleTime, currentSignalRaw, currentSignalFiltrado);
        }
    }
}