#include <Arduino.h>     
#include <WiFi.h>        
#include <WebServer.h>   
#include <LittleFS.h>    

// -------------------- CONFIGURAÇÕES BÁSICAS --------------------
#define ANALOG_PIN_1 34           // Pino analógico utilizado para leitura do sinal
#define SAMPLE_INTERVAL_US 1000   // Intervalo de amostragem em microssegundos (1 ms → 1000 Hz)
#define RECORD_DURATION_MS 3000   // Duração total da gravação (3 segundos)
#define MAX_SAMPLES (RECORD_DURATION_MS)  // Número máximo de amostras (equivale a 3000 amostras)
#define WINDOW 10                 // Tamanho da janela da média móvel (número de amostras para o filtro)

// -------------------- CONFIGURAÇÃO DO WIFI (ACCESS POINT) --------------------
const char *ssid = "ESP32_AP";        
const char *password = "12345678";    

WebServer server(80); 

// -------------------- VARIÁVEIS DO FILTRO --------------------
int filtroBuffer[WINDOW];   // Vetor para armazenar as últimas N leituras
long filtroSoma = 0;        // Soma acumulada das leituras no buffer
int filtroIndice = 0;       // Índice atual dentro do buffer (para controle circular)
int filtroCount = 0;        // Contador de quantas amostras já foram armazenadas (até atingir WINDOW)

// -------------------- BUFFERS DE DADOS --------------------
uint16_t bufferSignalRaw[MAX_SAMPLES];        // Vetor para armazenar o sinal bruto (sem filtro)
uint16_t bufferSignalFiltrado[MAX_SAMPLES];   // Vetor para armazenar o sinal filtrado
uint32_t bufferTime[MAX_SAMPLES];             // Vetor para armazenar o tempo correspondente de cada amostra
int sampleCount = 0;                          // Contador de amostras coletadas

// -------------------- CONTROLE DE GRAVAÇÃO --------------------
String csvData = "Tempo (ms),Bruto,Filtrado\n"; // Cabeçalho do CSV (para exportar os dados)
bool recording = false;                         // Flag que indica se a gravação está ativa
unsigned long startTime = 0;                    // Tempo em que a gravação começou
unsigned long lastSampleTime = 0;               // Marca do tempo da última amostra coletada

// -------------------- FUNÇÃO DE FILTRAGEM (MÉDIA MÓVEL) --------------------
int mediaMovel(int novoValor) {
  // Subtrai o valor antigo do somatório
  filtroSoma -= filtroBuffer[filtroIndice];
  
  // Substitui o valor antigo pelo novo valor lido
  filtroBuffer[filtroIndice] = novoValor;
  
  // Soma o novo valor ao total
  filtroSoma += novoValor;

  // Atualiza o índice
  filtroIndice = (filtroIndice + 1) % WINDOW;

  // Se ainda não preencheu toda a janela, incrementa o contador
  if (filtroCount < WINDOW) filtroCount++;

  // Retorna a média (soma das amostras dividida pelo número de amostras válidas)
  return filtroSoma / filtroCount;
}

/*
int mediaMovelFor(int novoValor) {
  static int buffer[WINDOW];            // Armazena os últimos valores lidos
  static int indice = 0;                // Índice atual do buffer circular
  static int count = 0;                 // Quantas amostras já foram registradas

  buffer[indice] = novoValor;           // Insere o novo valor no buffer
  indice = (indice + 1) % WINDOW;       // Avança circularmente
  if (count < WINDOW) count++;          // Atualiza a contagem de amostras

  long soma = 0;                        // Variável para acumular a soma
  for (int i = 0; i < count; i++) {     // Soma todos os elementos da janela
    soma += buffer[i];
  }

  return soma / count;                  // Retorna a média
}

*/

// -------------------- FUNÇÕES DE SERVIÇO (SERVIDOR WEB) --------------------

// Retorna o tipo de conteúdo com base na extensão do arquivo solicitado
String getContentType(String filename) {
  if (filename.endsWith(".htm") || filename.endsWith(".html")) return "text/html";
  else if (filename.endsWith(".css")) return "text/css";
  else if (filename.endsWith(".js")) return "application/javascript";
  else if (filename.endsWith(".png")) return "image/png";
  else if (filename.endsWith(".jpg")) return "image/jpeg";
  else if (filename.endsWith(".ico")) return "image/x-icon";
  else if (filename.endsWith(".json")) return "application/json";
  return "text/plain";
}

// Lê um arquivo armazenado no LittleFS e envia ao navegador
bool handleFileRead(String path) {
  if (path.endsWith("/")) path += "index.html";  // Se não especificar arquivo, abre index.html
  String contentType = getContentType(path);
  File file = LittleFS.open(path, "r");
  if (!file) {
    Serial.println("Arquivo não encontrado: " + path);
    return false;
  }
  server.streamFile(file, contentType);  // Envia o arquivo via servidor
  file.close();
  return true;
}

// -------------------- ROTAS DO SERVIDOR --------------------

// Caso o cliente acesse uma rota inexistente
void handleNotFound() {
  String uri = server.uri();
  Serial.println("Requisição não encontrada: " + uri);

  if(!handleFileRead(uri)){
    server.send(404, "text/plain", "Arquivo não encontrado");
  }
}

// Inicia a gravação dos dados (rota /start)
void handleStart() {
  if(!recording){
  if(!recording){
    sampleCount = 0;
    csvData = "Tempo (ms),Bruto,Filtrado\n";  // Reinicia o CSV
    startTime = millis();
    lastSampleTime = micros();
    recording = true;
  }
  server.send(200, "text/plain", "Gravando...");
  }
}

// Envia os dados coletados ao cliente (rota /data)
void handleData() {
  server.send(200, "text/plain", csvData);
}

// -------------------- CONFIGURAÇÃO INICIAL --------------------
void setup() {
  Serial.begin(115200);   // Inicializa comunicação serial para depuração
  delay(1000);

  // Inicializa o sistema de arquivos interno
  if (!LittleFS.begin()) {
    Serial.println("Erro ao montar LittleFS!");
    return;
  }
  Serial.println("LittleFS montado com sucesso");

  // Lista os arquivos disponíveis no sistema
  Serial.println("Arquivos disponíveis:");
  File root = LittleFS.open("/");
  File file = root.openNextFile();
  while (file) {
    Serial.println(String(" - ") + file.name());
    file = root.openNextFile();
  }

  // Cria o ponto de acesso Wi-Fi
  WiFi.softAP(ssid, password);
  Serial.println("Access Point iniciado");
  Serial.print("IP do AP: ");
  Serial.println("Access Point iniciado");
  Serial.print("IP do AP: ");
  Serial.println(WiFi.softAPIP());

  // Configura rotas HTTP
  server.onNotFound([]() {
    if (!handleFileRead(server.uri())) {
      server.send(404, "text/plain", "Arquivo não encontrado");
    }
  });

  // Ignora favicon (para evitar mensagens no console)
  server.on("/favicon.ico", []() {
    server.send(204);
  });

  server.on("/start", handleStart); // Inicia a gravação
  server.on("/data", handleData);   // Envia os dados coletados

  server.begin();
  Serial.println("Servidor HTTP iniciado");
  Serial.println("Servidor HTTP iniciado");
}

// -------------------- LOOP PRINCIPAL --------------------
void loop() {
  server.handleClient(); // Mantém o servidor respondendo a requisições

  // Se a gravação estiver ativa:
  if(recording){
    unsigned long now_us = micros();
    unsigned long elapsed_ms = millis() - startTime;

    // Coleta nova amostra 
    if(elapsed_ms <= RECORD_DURATION_MS && (now_us - lastSampleTime >= SAMPLE_INTERVAL_US)){
      lastSampleTime = now_us; //Marca do tempo da última amostra coletada

      if(sampleCount < MAX_SAMPLES){
        int leitura = analogRead(ANALOG_PIN_1);  // Leitura do sinal bruto
        int filtrado = mediaMovel(leitura);      // Aplica o filtro de média móvel

        // Armazena tempo, sinal bruto e sinal filtrado
        bufferTime[sampleCount] = elapsed_ms;
        bufferSignalRaw[sampleCount] = leitura;
        bufferSignalFiltrado[sampleCount] = filtrado;
        sampleCount++;
      }
    }

    // Quando atingir o tempo máximo de gravação:
    if(elapsed_ms > RECORD_DURATION_MS){
      // Monta o conteúdo CSV com todos os dados coletados
      for(int i=0; i<sampleCount; i++){
        csvData += String(bufferTime[i]) + "," +
                   String(bufferSignalRaw[i]) + "," +
                   String(bufferSignalFiltrado[i]) + "\n";
      }
      recording = false;
      Serial.println("Captura finalizada!");
      Serial.println("Captura finalizada!");
    }
  }
}
 
