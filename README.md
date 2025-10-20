# 😊 EMG FACIAL  📊

## 📋 Descrição do Projeto

O **EMG FACIAL** é um projeto inovador que mede a contração do músculo zigomático do rosto através de sinais EMG (eletromiografia), funcionando essencialmente como um "sorrisômetro". O sistema captura, processa e analisa os sinais elétricos musculares em tempo real, fornecendo dados precisos sobre a intensidade e qualidade dos sorrisos através de gráficos interativos e análise estatística.

## 🎯 Objetivo

Desenvolver um sistema de monitoramento não-invasivo que:
- Mede a atividade elétrica do músculo zigomático maior
- Quantifica a intensidade dos sorrisos em tempo real
- Fornece análise estatística detalhada dos dados coletados
- Permite exportação de dados para análises posteriores
- Oferece interface web intuitiva para visualização em tempo real

## 🏗️ Arquitetura do Sistema

### Hardware (Backend - ESP32)
- **Microcontrolador**: ESP32 com WiFi integrado
- **Sensor**: Eletrodos para captura de sinais EMG
- **Entrada Analógica**: Pino 34 para leitura dos sinais
- **Comunicação**: Access Point WiFi para interface web

### Software (Frontend - Web Interface)
- **Interface**: HTML5 com CSS responsivo
- **Visualização**: Gráficos em tempo real usando Chart.js
- **Funcionalidades**: Captura, análise e exportação de dados
- **Compatibilidade**: Multiplataforma via navegador web

## 🚀 Como Funciona

### 1. **Configuração do Hardware**
```
ESP32 → Eletrodos EMG → Músculo Zigomático
```

### 2. **Processo de Captura**
1. **Inicialização**: ESP32 cria rede WiFi "ESP32_CSV"
2. **Conexão**: Usuario conecta via navegador (IP: 192.168.4.1)
3. **Calibração**: Sistema estabelece linha base do sinal
4. **Monitoramento**: Captura contínua a 1kHz por 3 segundos
5. **Processamento**: Conversão analógica-digital dos sinais EMG

### 3. **Interface Web - Passo a Passo**

#### 🖥️ **Tela Principal**
- **Status de Conexão**: Indicador visual do eletrodo
- **Painel de Controle**: Botões para iniciar/parar captura
- **Gráfico em Tempo Real**: Visualização dinâmica dos sinais
- **Estatísticas Instantâneas**: Métricas em tempo real

#### 📊 **Funcionalidades Detalhadas**

**Controles Disponíveis:**
- ▶️ **Iniciar Captura**: Inicia a gravação dos sinais EMG
- ⏹️ **Parar Captura**: Finaliza a sessão de monitoramento
- 💾 **Exportar Dados**: Salva dados em formato CSV
- 🧹 **Limpar Registro**: Remove dados da sessão atual

**Métricas Monitoradas:**
- **Amplitude Atual**: Intensidade instantânea (mV)
- **Frequência Média**: Frequência do sinal (Hz)
- **Amostras Coletadas**: Total de pontos capturados
- **Tempo de Gravação**: Duração da sessão (mm:ss)

**Análise de Qualidade:**
- **Excelente**: Amplitude > 3mV (sorriso intenso)
- **Boa**: Amplitude 2-3mV (sorriso moderado)
- **Regular**: Amplitude 1-2mV (sorriso leve)
- **Baixa**: Amplitude < 1mV (mínima atividade)

### 4. **Exportação e Análise**
- **Formato**: CSV com timestamp, amplitude, frequência e qualidade
- **Compatibilidade**: Excel, Python, R, MATLAB
- **Dados Inclusos**: 
  - Timestamp completo
  - Tempo relativo (s)
  - Amplitude em milivolts
  - Frequência em Hz
  - Classificação de qualidade

## 🛠️ Tecnologias Utilizadas

### Backend
- **PlatformIO**: Ambiente de desenvolvimento
- **ESP32**: Microcontrolador com WiFi
- **C++**: Linguagem de programação
- **WebServer**: Servidor HTTP embarcado

### Frontend
- **HTML5**: Estrutura da interface
- **CSS3**: Estilização responsiva
- **JavaScript ES6**: Lógica da aplicação
- **Chart.js**: Biblioteca para gráficos
- **Web APIs**: FileSystem, Blob, URL para exportação

## 🔧 Configuração e Instalação

### Pré-requisitos
- **PlatformIO IDE** ou **VS Code + PlatformIO Extension**
- **ESP32** DevKit
- **Eletrodos EMG** compatíveis
- **Cabo USB** para programação

### Instalação

1. **Clone o repositório**
```bash
git clone https://github.com/AntonioAugustoo/EMG_FACIAL.git
cd EMG_FACIAL
```

2. **Configure o PlatformIO**
```bash
# Abra o projeto no VS Code com PlatformIO
code .
```

3. **Upload para ESP32**
- Conecte o ESP32 via USB
- Compile e faça upload do código (Ctrl+Alt+U)

4. **Acesse a Interface**
- Conecte WiFi "ESP32_CSV" (senha: 12345678)
- Abra navegador: `http://192.168.4.1`
## 🎓 Aplicações

### Área Médica
- Análise de paralisia facial
- Reabilitação muscular
- Estudos de neurologia

### Pesquisa Científica
- Análise comportamental
- Estudos de emoção
- Interface homem-máquina

## 📊 Especificações Técnicas

### Parâmetros de Captura
- **Taxa de Amostragem**: 1000 Hz (1 amostra/ms)
- **Duração**: 3 segundos por sessão
- **Resolução**: 12 bits (4096 níveis)
- **Faixa Dinâmica**: 0-3.3V (ESP32)

## 📁 Estrutura do Projeto

```
EMG_FACIAL/
├── README.md                 # Documentação principal
├── .gitignore               # Arquivos ignorados pelo Git
├── BackEnd/                 # Código do ESP32
│   ├── platformio.ini       # Configurações do PlatformIO
│   ├── src/
│   │   └── main.cpp         # Código principal do ESP32/ Lógica da aplicação
│   ├── include/             # Headers personalizados
│   ├── lib/                 # Bibliotecas locais
│   └── test/                # Testes unitários
└── FrontEnd/                # Interface Web
    ├── index.html        # Esqueleto da página
    ├── style.css         # Estilos da interface
    └──script.js          # Página dinâmica
```
## 👥 Autores - Desenvolvimento inicial

- **Antonio Augusto** - *FrontEnd* - [@AntonioAugusto](https://github.com/AntonioAugustoo)
- **Emily Horrana** - *BackEnd* - [@emyHorrana](https://github.com/emyHorrana)

## 🔗 Links Úteis

- [Documentação do ESP32](https://docs.espressif.com/projects/esp-idf/en/latest/)
- [PlatformIO Docs](https://docs.platformio.org/)
- [Chart.js Documentation](https://www.chartjs.org/docs/)
- [EMG Signal Processing](https://en.wikipedia.org/wiki/Electromyography)

---

**Transformando sorrisos em dados, dados em conhecimento!**  
