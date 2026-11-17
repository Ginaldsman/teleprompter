# Teleprompter

Aplicativo de teleprompter para usar no navegador do celular. Cole o roteiro, ajuste a apresentação e inicie uma rolagem automática suave — na vertical ou na horizontal — para gravar vídeos lendo o texto perto da câmera. O modo câmera mostra a imagem da câmera frontal com o roteiro sobreposto e permite gravar o vídeo (sem o texto).

Feito com HTML5, CSS e JavaScript puro: **sem frameworks, bibliotecas, backend ou etapa de build**. Todo o processamento acontece no navegador e o texto nunca sai do dispositivo.

## Arquivos

| Arquivo | Descrição |
| --- | --- |
| `index.html` | Estrutura das telas de edição e apresentação |
| `styles.css` | Layout mobile-first, temas claro/escuro, safe areas e animações |
| `app.js` | Persistência, medições, rolagem por `requestAnimationFrame`, câmera, gravação, tela cheia, Wake Lock e atalhos |
| `README.md` | Este guia |

## Como executar

O projeto é um site estático, mas precisa ser servido por HTTP (não abra `file://`, pois alguns recursos do navegador são bloqueados nesse modo).

### No computador

Na pasta do projeto, execute:

```bash
python -m http.server 8080
```

Depois abra:

```text
http://localhost:8080
```

Se preferir Node.js:

```bash
npx serve . -l 8080
```

### No celular, pela mesma rede Wi-Fi

1. Conecte o computador e o celular à **mesma rede Wi-Fi**.
2. Inicie o servidor com o comando acima (o `python -m http.server 8080` já aceita conexões da rede local).
3. Descubra o IPv4 do computador:
   - **Windows:** `ipconfig` → “Endereço IPv4” do adaptador Wi-Fi (ex.: `192.168.0.10`)
   - **macOS:** `ipconfig getifaddr en0`
   - **Linux:** `hostname -I`
4. No navegador do celular, acesse:

```text
http://192.168.0.10:8080
```

Substitua `192.168.0.10` pelo IP do seu computador. Se a página não abrir, verifique o firewall do sistema e se o roteador não está com isolamento de clientes (AP isolation) ativado.

> **Dica:** para testar rapidamente, você também pode publicar a pasta em qualquer hospedagem estática (GitHub Pages, Netlify, Vercel etc.). Nenhum ajuste é necessário.
>
> **Importante para o modo câmera:** o navegador só libera a câmera em contexto seguro (HTTPS ou `localhost`). Em HTTP pela rede local (`http://192.168…`), o teleprompter funciona, mas a câmera fica indisponível. Para usar no celular, publique o app em uma hospedagem HTTPS ou use um túnel HTTPS.

## Como usar

### Modo de edição

- **Roteiro:** digite ou cole o texto. A contagem de palavras e a duração estimada são atualizadas em tempo real.
- **Velocidade:** de 60 a 300 palavras por minuto (ppm). A duração estimada usa essa mesma referência.
- **Tamanho da fonte, altura da linha e margens laterais:** ajustes visuais aplicados na apresentação.
- **Alinhamento:** à esquerda ou centralizado.
- **Tema:** escuro (padrão, fundo preto e texto branco) ou claro.
- **Espelhamento horizontal/vertical:** para gravações com espelho, teleprompter de vidro ou equipamento que inverte a imagem.
- **Contagem regressiva:** 3 segundos antes de começar a rolar (ativada por padrão).
- **Modo câmera:** abre a câmera frontal junto com a apresentação, com o texto sobreposto. O botão principal passa a mostrar **Iniciar com câmera**.
- **Limpar texto:** pede confirmação antes de apagar.
- **Iniciar teleprompter:** entra no modo de apresentação.

Texto e configurações são salvos automaticamente no `localStorage` do navegador. Ao recarregar a página, tudo é restaurado. Use “Limpar texto” / limpar dados do site para começar do zero.

### Modo de apresentação

- Rolagem vertical contínua e suave, com barra de progresso no topo.
- **Play/Pause:** pausa e retoma exatamente na posição atual.
- **Reiniciar:** volta ao início.
- **− / +:** altera a velocidade em tempo real.
- **Câmera:** liga ou desliga a câmera frontal durante a apresentação (o botão é ocultado quando a API não está disponível).
- **Gravar:** aparece quando a câmera está ligada; inicia e para a gravação do vídeo.
- **Tela cheia:** entra ou sai da tela cheia (o botão é ocultado quando a API não existe).
- **Voltar:** retorna à edição.
- Ao final do texto, a rolagem para e o botão principal vira **Repetir do começo**.

A tela inteira fica travada durante a apresentação para evitar rolagens acidentais, e as margens respeitam as `safe-area-insets` de aparelhos com notch.

### Modo câmera e gravação

- Ao ativar **Modo câmera** nos ajustes, a câmera frontal é ligada automaticamente ao iniciar a apresentação. Também é possível ligá-la ou desligá-la pelo botão de câmera nos controles.
- O texto rola sobre a prévia em tela cheia, com sombra para manter a leitura legível. Durante a câmera, o texto fica sempre branco, mesmo no tema claro.
- A prévia aparece espelhada, como um espelho. O arquivo gravado mantém a imagem real (não espelhada) da câmera.
- **Gravar vídeo:** grava somente a imagem da câmera. Se o microfone for autorizado, o áudio também entra; se for negado, a gravação continua sem áudio. **O roteiro não é incluído no vídeo.**
- O arquivo é baixado automaticamente ao parar a gravação, em **MP4** (quando o navegador suporta) ou **WebM**.
- Ao desligar a câmera ou sair da apresentação, câmera e microfone são liberados e uma gravação em andamento é finalizada e salva.
- Se a permissão for negada ou não houver câmera disponível, o teleprompter continua funcionando normalmente e mostra um aviso curto, sem erros no console.

> O modo câmera é uma **prévia dentro do próprio app**. Navegadores não conseguem sobrepor o texto à câmera de outros aplicativos (WhatsApp, câmera do sistema etc.); para isso seria necessário um app nativo com permissão de sobreposição.

### Atalhos de teclado (desktop)

- `Espaço` — iniciar/pausar
- `Esc` — sair da apresentação
- `Ctrl+Enter` (ou `Cmd+Enter`) — iniciar a apresentação a partir do editor

## Compatibilidade e limitações

- Testado em Chromium (Chrome/Edge). O código também usa os prefixos `webkit` para Safari.
- **Tela cheia:** depende da Fullscreen API. No iPhone, o Safari normalmente não permite tela cheia de elementos arbitrários; nesse caso o botão é simplesmente ocultado. A tela cheia só é solicitada após o toque no botão, respeitando a exigência de gesto do usuário.
- **Screen Wake Lock:** requer contexto seguro (HTTPS ou `localhost`) e suporte do navegador. Em HTTP pela rede local ela pode não estar disponível; o app continua funcionando normalmente, sem erros no console.
- **Câmera:** exige contexto seguro (HTTPS ou `localhost`), suporte a `getUserMedia` e autorização do usuário. O app pede a câmera frontal, mas usa outra câmera se ela não existir. Se a permissão for negada, o modo de apresentação continua sem câmera.
- **Gravação:** depende da `MediaRecorder`. O formato é escolhido entre as opções suportadas pelo navegador (MP4 ou WebM). No iOS, o download pode abrir a folha de compartilhamento em vez de salvar direto na pasta Downloads. A qualidade e a resolução seguem o stream fornecido pelo aparelho.
- **Enquadramento:** a prévia usa `object-fit: cover` para preencher a tela; em celulares na vertical, as laterais da imagem podem ser cortadas na visualização. O arquivo gravado usa a imagem original do stream.
- **Orientação:** o layout e as medidas são recalculados ao girar o aparelho ou redimensionar a janela, preservando o progresso da leitura.
- **Precisão da rolagem:** o avanço usa o tempo real entre quadros (`requestAnimationFrame` + delta time), então a velocidade não depende da taxa de atualização da tela.
- **Texto:** é exibido como texto puro com `textContent`; não há interpretação de HTML.

## Verificações realizadas

- Carregamento sem erros de JavaScript ou avisos no console.
- Layout sem rolagem horizontal em 320 px, 390 px e 844×390 (paisagem).
- Contagem de palavras e estimativa de duração.
- Início com e sem contagem regressiva (3 → 2 → 1).
- Pausa com posição idêntica antes/depois da espera; retomada de onde parou.
- Alteração de velocidade durante a execução.
- Reinício e repetição após o fim do texto (parada em 100%, estado “Repetir do começo”).
- Espelhamento horizontal, vertical e ambos (transformação combinada).
- Persistência de texto, velocidade, fonte, altura de linha, margens, alinhamento, tema, espelhamento, contagem regressiva e modo câmera após recarregar.
- Limpeza do texto com confirmação (cancelar e confirmar).
- Redimensionamento/orientação com preservação do progresso.
- Atalhos `Espaço` e `Esc`; retorno à posição anterior do editor.
- Fallback de tela cheia indisponível, sem erros no console.
- Modo câmera com stream simulado: prévia em tela cheia, texto sobreposto, alterações de velocidade/rolagem e alternância liga/desliga.
- Gravação de vídeo com download em MP4, selo REC e cronômetro; gravação finalizada e salva ao sair da apresentação.
- Permissão de câmera negada: apresentação continua e o aviso aparece sem erros no console.
- Liberação da track de câmera ao desligar a câmera e ao sair; microfone encerrado junto com a gravação.
- Controles sem transbordo em 320 px, 390 px e 568×320 (paisagem).

## Estrutura do projeto

```text
Teleprompter/
├── index.html
├── styles.css
├── app.js
└── README.md
```

Comando para iniciar (na pasta do projeto):

```bash
python -m http.server 8080
```
