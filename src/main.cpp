#include <Arduino.h> 
#include <WiFi.h> 
#include <WebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h> // ADICIONADO: Para serializar a resposta JSON

// -------------------- CONFIGURAÇÕES BÁSICAS --------------------
#define PINO_ANALOGICO_1 34     // Pino analógico utilizado para leitura do sinal
#define INTERVALO_AMOSTRAGEM_US 1000// Intervalo de amostragem em microssegundos (1 ms → 1000 Hz)
#define JANELA 10          // Tamanho da janela da média móvel

// -------------------- CONFIGURAÇÃO DO WIFI (ACCESS POINT) --------------------
const char *nomeRede = "ESP32_AP";  
const char *senhaRede = "12345678";

WebServer servidor(80); 

// -------------------- VARIÁVEIS DO FILTRO --------------------
int bufferFiltro[JANELA]; 
long somaFiltro = 0;      
int indiceFiltro = 0;      
int contadorFiltro = 0;

// -------------------- VARIÁVEIS DE DADOS ATUAIS (TEMPO REAL) --------------------
uint32_t tempoAmostraAtual = 0;
uint16_t sinalBrutoAtual = 0;
uint16_t sinalFiltradoAtual = 0;

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
        gravando = true;
        Serial.println("Captura em tempo real iniciada.");
    }
    servidor.send(200, "text/plain", "Captura iniciada.");
}

void pararCaptura() {
    gravando = false; 
    Serial.println("Captura em tempo real parada.");
    servidor.send(200, "text/plain", "Captura parada.");
}

void dadosTempoReal() {
    StaticJsonDocument<96> documento; 
    char bufferJson[96]; 

    if (gravando) {
        documento["time_ms"] = tempoAmostraAtual;
        documento["raw"] = sinalBrutoAtual;
        documento["filtered"] = sinalFiltradoAtual;
        
        size_t tamanho = serializeJson(documento, bufferJson); 

        servidor.setContentLength(tamanho); 

        servidor.send(200, "application/json", bufferJson); 
    } else {
        documento["status"] = "parado";
        size_t tamanho = serializeJson(documento, bufferJson);

        servidor.setContentLength(tamanho);

        servidor.send(200, "application/json", bufferJson);
    }
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
    
    WiFi.softAP(nomeRede, senhaRede);

    servidor.onNotFound([]() {
        if (!lerArquivo(servidor.uri())) {
            servidor.send(404, "text/plain", "Arquivo não encontrado");
        }
    });
    servidor.on("/favicon.ico", []() { servidor.send(204); });

    servidor.on("/start", iniciarCaptura);
    servidor.on("/stop", pararCaptura);      
    servidor.on("/live_data", dadosTempoReal); 

    servidor.begin();
    Serial.println("Servidor HTTP iniciado");
}

// -------------------- LOOP PRINCIPAL --------------------
void loop() {
    servidor.handleClient();

    unsigned long agora_us = micros();
    
    if(agora_us - tempoUltimaAmostra >= INTERVALO_AMOSTRAGEM_US){
        tempoUltimaAmostra = agora_us;

        int leitura = analogRead(PINO_ANALOGICO_1);
        int filtrado = mediaMovel(leitura);

        tempoAmostraAtual = millis() - tempoInicio; 
        sinalBrutoAtual = leitura;
        sinalFiltradoAtual = filtrado;

        if(gravando){
            Serial.printf("T: %lu ms, B: %u, F: %u\n", tempoAmostraAtual, sinalBrutoAtual, sinalFiltradoAtual);
        }
    }
}