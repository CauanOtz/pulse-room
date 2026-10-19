# Pulse Room — correção de fidelidade visual

## Alvo e diagnóstico

A referência foi tratada como alvo de composição, e não apenas de cores.
A comparação inicial da referência com a captura anterior identificou cinco
problemas principais:

1. Fundo sólido sem profundidade na sala de voz.
2. Avatares quase iguais, sem protagonista, e informação de fala no topo.
3. Coluna central larga demais e painel de membros começando abaixo do cabeçalho.
4. Controles isolados, sem superfície integrada ou separador.
5. Campo de mensagem estreito, botão embutido e recuos diferentes dos da referência.

## Implementação

- Grade de 84 px / 264 px / centro flexível / aproximadamente 350 px na resolução
  da referência. O painel contextual ocupa a altura inteira da janela.
- Sala de voz de aproximadamente 352 px de altura na captura principal, com
  informação à esquerda, avatar principal de 160 px e secundários de 88 px.
- O participante principal é quem está realmente falando. Nas pausas, ele
  permanece em destaque, com o estado atualizado. Um participante silenciado
  nunca recebe destaque de fala a partir de um relatório antigo.
- Fundo fotográfico abstrato monocromático, desfocado, com luz difusa e camadas
  de escurecimento. Sombras e bordas sutis separam o card do restante da janela.
- Controles circulares de 52 px, separador após o compartilhamento e saída clara.
  Fones, microfone, dispositivos, qualidade, tela e configurações continuam reais.
- Visualizador alimentado exclusivamente por uma faixa de áudio existente. Não
  solicita dispositivo, não conecta a saída de áudio e não encerra a faixa da
  chamada. Sem uma faixa disponível, nenhuma onda simulada é exibida.
- Navegação com ícones agrupados, nome e metadados reais. Membros com presença,
  cargos e estados reais; cabeçalho alinhado ao topo da composição.
- Chat com avatares de 44 px, primeira mensagem próxima da sala, horários
  discretos e compositor arredondado com botão de envio separado.
- Fotos reais, iniciais neutras, APIs, autenticação, permissões, estado de chamada
  e comunicação LiveKit preservados. Não foram adicionadas dependências.

## Captura e comparação

Referência original:
`C:/Users/Gamer/AppData/Local/Temp/codex-clipboard-f836c0f0-f117-4570-b381-bc3c2b526669.png`.

A imagem original mede 1672 × 941 px. O cenário externo foi excluído com o
recorte `(50, 35, 1622, 905)`, produzindo 1572 × 870 px. A aplicação foi capturada
em **1572 × 870 CSS px, densidade 1**, equivalente ao conteúdo real da referência.
Também foram capturados 1080 × 680 e 1920 × 1080.

Artefatos finais, preservados fora da limpeza do executor de testes:

- [Interface completa](C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-fidelity/final.png)
- [Comparação completa: referência acima, implementação abaixo](C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-fidelity/comparison-final.png)
- [Comparação ampliada da sala de voz](C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-fidelity/voice-comparison.png)
- [Janela mínima de 1080 × 680](C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-fidelity/final-1080.png)
- [1920 × 1080](C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-fidelity/final-1920.png)

As comparações foram feitas com as duas imagens juntas, incluindo ampliações
somente do componente de voz e do cabeçalho/lista de membros.

## Ciclos de revisão

| Ciclo | Constatação na captura | Correção |
| --- | --- | --- |
| 1 | A nova composição já reproduzia as regiões, mas o texto estava baixo, os avatares altos, o intervalo dos secundários curto, o título de membros alto e o compositor embutido. | Ajustes de coordenadas, distribuição horizontal, alinhamento do cabeçalho e botão separado. |
| 2 | O espaçamento ajustado fez o terceiro secundário quebrar de linha na largura central, embora as dimensões extremas passassem. | Grade interna com três colunas proporcionais e verificação explícita na largura da referência. |
| 3 | A grade permaneceu em uma linha e o protagonista manteve escala superior. A informação de fala ainda estava aproximadamente 20 px baixa. | Posicionamento da informação independente da presença do visualizador e ajuste final vertical. |
| 4 | Conferência após a verificação completa: medidas, hierarquia, controles, legenda, coluna contextual e compositor. | Captura final comparada ao alvo e preservada nos links acima. |

As capturas intermediárias foram revisadas durante a sessão; a execução completa
recriou a pasta temporária de testes. As evidências finais foram copiadas para
uma pasta persistente separada.

## Superfícies verificadas

| Superfície | Resultado e diferenças intencionais |
| --- | --- |
| Geometria | Card, protagonista, secundários e controles alinhados à composição do alvo; colunas recompostas, sem sobreposição do compositor. |
| Tipografia | Schibsted Grotesk local preservada, hierarquia de título/nome/metadados e truncamento de nomes longos. |
| Profundidade | Textura fotográfica real como asset, luz desfocada, gradientes neutros e sombras pequenas. A textura não é uma imagem estática da interface. |
| Avatares | Fotos reais quando existentes. As contas de teste não têm fotos; as iniciais não são substituídas por retratos inventados. |
| Conteúdo | A captura contém somente as mensagens criadas pelo teste. Nenhuma mensagem adicional foi colocada no produto para preencher o espaço. |
| Interação | Seleção, fala, mute, deafen, tela, fullscreen, menus, perfis, recolhimento e envio mantidos; foco visível e movimento reduzido respeitados. |

Não há achados P0/P1/P2 visuais pendentes no escopo corrigido. Não se declara
reprodução pixel a pixel: fotos, nomes, histórico e recursos disponíveis diferem
do conceito. Abas de mídia, anexos, câmera e mensagens diretas ausentes no cliente
não foram representados como funcionalidades falsas.

## Validação funcional

- `npm run verify`: aprovado, incluindo tipos, **380 testes unitários em 39
  arquivos e sete testes Electron**.
- `npm run build`: aprovado para renderer de produção, Electron e servidor.
- `git diff --check`: aprovado.
- O teste de layout verifica explicitamente os três secundários na mesma linha,
  a escala do protagonista e a ausência de rolagem extra na composição central.
- Testes cobrem envio durante a chamada, áudio, recolhimento dos membros, saída,
  navegação entre servidores, permissões, perfis, dispositivos, gate, RNNoise,
  compartilhamento de tela, fullscreen e fechamento para a bandeja.
- Novos testes verificam a troca do protagonista por fala real, pausas, relatório
  antigo de fala em usuário silenciado e o ciclo de vida do visualizador.
- A captura integrada não registrou erros JavaScript. O teste desktop existente
  verifica também erros de console e falhas do renderer.

A captura usa contas de teste criadas pelas APIs reais em PostgreSQL em memória.
O transporte de voz dessa captura é o transporte de teste existente, restrito
à configuração do teste. Não integra o build de produção. Chamadas LiveKit entre
máquinas ou com o servidor de produção não foram executadas. Sem faixa remota no
fixture, o visualizador não aparece na captura; seu processamento e descarte
foram verificados por teste unitário.

O build mantém o aviso de bundle JavaScript acima de 800 kB; divisão de bundles
não fez parte desta correção. A imagem de fundo adiciona aproximadamente 2,4 MB
como asset local. Nenhum instalador foi publicado ou enviado.

## Arquivos

Principais alterações desta correção:

- `src/renderer/app.tsx`: grade, painel contextual e presença no cabeçalho.
- `src/renderer/theme.css`: tokens de superfícies e dimensões.
- `src/renderer/room-layout.css`: composição, profundidade e responsividade.
- `src/renderer/components/stage.tsx`: informação e protagonista reais.
- `src/renderer/components/participant-tiles.tsx`: hierarquia e agrupamento.
- `src/renderer/components/voice-waveform.tsx`: visualizador de faixa existente.
- `src/renderer/components/call-controls.tsx`: agrupamento e separador.
- `src/renderer/components/channel-sidebar.tsx`: ícones e metadados.
- `src/renderer/components/member-sidebar.tsx`: contexto e estados.
- `src/renderer/components/text-chat.tsx`: compositor e distribuição.
- `assets/voice-atmosphere.png`: fundo abstrato gerado para a sala.
- `tests/e2e/workspace-layout.spec.ts`, `tests/unit/stage.test.tsx` e
  `tests/unit/voice-waveform.test.tsx`: verificações adicionais.

As alterações anteriores em `server-rail.tsx`, `member-manager.tsx`,
`tests/e2e/community.spec.ts`, `tests/e2e/desktop.spec.ts` e
`tests/unit/call-navigation.test.tsx` continuam locais.

## Asset de fundo

Arquivo: `assets/voice-atmosphere.png`, 1942 × 809 px. Gerado pela ferramenta
integrada de imagens e copiado para o projeto; não depende de um caminho temporário.
Nenhum retrato foi gerado. Prompt utilizado:

> Use case: photorealistic-natural. Asset type: abstract background texture for the voice panel of a desktop communication app. Primary request: create ONLY a very wide softly defocused monochrome photographic background, no UI. Landscape ratio 2.4:1. Graphite and charcoal black frosted glass with barely recognizable out-of-focus folds and diffuse studio light. The top left and center left have soft mid-gray vertical photographic light, the center is deep charcoal near #151719, the far right lower corner has a soft luminous silver-gray blurred area. Organic photographic tonal movement rather than a smooth synthetic flat gradient. Very subtle fine photographic grain. Dark premium tactile atmosphere, low contrast overall, enough soft light patches to give depth behind white UI. NO people, faces, portraits, text, logos, symbols, circles, frames, controls, stars, neon, blue tint or any saturated colors. No sharp edges. This is a backdrop asset, not an interface mockup.

Nenhum commit, push, tag ou publicação foi realizado.

final result: passed

## Painel contextual direito — revisão de 18/10/2026

Escopo desta revisão: somente Members, Media e Links. O layout da chamada,
conversa, barra esquerda e cabeçalho principal não foi redesenhado. A coluna
direita passou de 350 para 340 px em janela ampla, conforme o pedido; a grade
central apenas recebe o espaço liberado. As larguras existentes de 280 e 236 px
nas janelas menores foram mantidas.

### Fontes e normalização

- Alvo: `C:/Users/Gamer/AppData/Local/Temp/codex-clipboard-b68d337c-ff54-4c7f-91cc-a17acaa47682.png`,
  PNG de 1600 × 900. A moldura externa não faz parte do painel a implementar.
- Implementação: `http://localhost:5173`, capturada pelo navegador integrado,
  viewport CSS de 1600 × 900 e `devicePixelRatio=1`. Capturas de implementação
  possuem 1600 × 900 pixels; a API de captura retorna JPEG mesmo nos arquivos
  salvos com extensão `.png`. A compressão suaviza o texto; medidas do DOM
  complementam a avaliação visual.
- Pasta das evidências: `C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-context-panel/`.
- Comparação conjunta: `04-reference-comparison.png`, 1545 × 1460. Contém os
  dois aplicativos completos e recortes focados da referência, estado anterior
  e duas iterações. A visão geral usa redução proporcional; os recortes usam
  as dimensões originais, removendo a moldura da referência.
- Estados finais: `06-members-final.png`, `06-media-final.png` e
  `06-links-final.png`. Visão das três abas: `05-panels-overview.png`.
- Responsividade: `03-members-1080.png`, `03-members-three-1080.png`,
  `03-media-1080.png` e `03-links-1080.png`, viewport de 1080 × 720.

### Comparações e correções

| Passagem | Achado | Correção e evidência |
| --- | --- | --- |
| Antes | Compartilhamentos presos ao rodapé, longe dos membros; links em card isolado; ausência de ações alinhadas nas linhas. | Estado preservado em `00-members-before.png`, `00-media-before.png` e `00-links-before.png`. |
| Iteração 1 | A composição já reunia membros e arquivos, mas os títulos de grupos padrão interrompiam a lista da referência e o alinhamento vertical das abas ainda diferia. A galeria com uma única imagem deixava metade da linha vazia. | `01-members-iteration.png`, `01-media-iteration.png`, `01-links-iteration.png`. |
| Iteração 2 | Títulos padrão mantidos para leitores de tela, lista visual contínua, cargos configurados como destacados preservados; posição das abas refinada; imagem única aproveita a largura. | `02-members-refined.png`, `02-media-refined.png`, `02-links-refined.png` e comparação conjunta. |
| Interação | See all e fechamento da prévia precisavam devolver o foco a um controle útil. | See all foca Media; fechar a prévia devolve o foco à miniatura. Verificado no navegador, inclusive em 1080 px. |

Medidas finais em 1600 px: painel de 340 px, padding horizontal de 24 px,
abas de 13 px, cabeçalho de 76 px, membros em linhas de 62 px e avatares de
44 px. A divisória de compartilhamentos fica 28 px após a lista, com 24 px
antes do título. Arquivos usam miniaturas de 48 px e metadados reais.

### Interações e estados verificados

1. Members: um e três membros reais, avatar/iniciais, cargo, menu, perfil
   completo e acesso preservado a mute, deafen, timeout, transferência, kick e
   ban conforme as permissões. Nenhuma ação de moderação foi executada na
   conferência manual.
2. Media: See all, galeria, arquivos separados, ampliação e retorno do foco.
   O teste integrado verifica também a miniatura de vídeo e sua abertura no
   player, além de áudio e download.
3. Links: domínio, URL com título completo acessível, autor/data, abertura
   existente e atualização. Não há consulta externa de favicon ou preview.
4. Contexto: trocar entre Just us e Friends mantém suas coleções separadas;
   o estado vazio do servidor sem arquivos não recebe conteúdo fictício.
5. Teclado e dimensões: setas e End selecionam e focam a aba; em 1080 × 720
   os controles cabem, o painel mede 236 px e a página não transborda
   horizontalmente. Cabeçalho e conteúdo possuem áreas separadas; a rolagem
   pertence ao conteúdo do painel.

### Limites e resultado

A referência possui seis membros, fotografias e quatro arquivos; o canal
local observado possui um membro, iniciais e uma imagem. Esses dados não foram
substituídos para reproduzir a densidade do exemplo. O outro servidor local
possui três membros e nenhum anexo. A presença mudou durante a sessão; a
ausência de chamada não foi tratada como offline. Speaking, Listening e Muted
foram verificados com estados de participantes em teste, sem inventar presença
na aplicação. Media e Links seguem a linguagem do alvo; não há referências
separadas dessas abas para afirmar equivalência pixel a pixel.

Não foram identificados P0/P1/P2 pendentes no escopo do painel. Não se declara
conformidade completa de acessibilidade nem fidelidade pixel a pixel com dados
e fotografias diferentes.

Durante a atualização ao vivo, uma versão intermediária de ChannelResources
recebeu as propriedades antigas antes da atualização de MemberSidebar. Isso
recarregou a sessão e desconectou a chamada local. A incompatibilidade foi
corrigida; os componentes finais passaram nos testes integrados. A chamada
real não foi reiniciada automaticamente.

- `npm run verify`: aprovado; 391 testes unitários em 42 arquivos e oito
  testes Electron.
- `npm run build`: aprovado; o aviso existente de bundle acima de 800 kB
  permanece.
- `git diff --check`: aprovado.
- Servidor dev mantido em `http://localhost:5173`; nenhuma publicação,
  alteração de versão, commit ou push.

final result: passed

---

## Server Settings — referência de 19/10/2026

### Alvo, escopo e ambiente

Referência fornecida: `C:/Users/Gamer/AppData/Local/Temp/codex-clipboard-946154ef-301d-4701-8871-1358bafe3960.png` (1672 × 941). A composição é o contrato: rail administrativa, identidade horizontal, onboarding em duas colunas, três atalhos e faixa destrutiva inferior. O escopo é o desktop existente, sem scaffold ou substituição de integrações.

A aba antiga do navegador estava em uma página de erro e a observação foi bloqueada pela política do navegador. As capturas e os fluxos foram executados no Electron do próprio projeto, com conta e banco de teste isolados, APIs reais e PostgreSQL via PGlite. A proteção de navegação do aplicativo permaneceu habilitada; documentos comparativos foram renderizados em uma janela separada do teste. Não foram preenchidos os servidores reais do usuário com conteúdo de demonstração.

### Evidências e ciclos

Pasta: `C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-server-settings/`.

| Ciclo | Evidência combinada: referência + render | Diferenças observadas e correção |
| --- | --- | --- |
| Antes | `server-settings-before.png` | Nome e ícone em dois blocos estreitos, sem banner, estatísticas, onboarding ou atalhos. |
| 1 | `comparison-cycle-1.png` | Conteúdo 52 px à esquerda, campos altos, banner muito luminoso e Danger zone cortada. Reposicionados o conteúdo e o banner; reduzidas altura dos campos e intensidade do asset padrão. |
| 2 | `comparison-cycle-2.png` | Onboarding 10 px alto e margem direita sensível à rolagem. Ajustados textarea, margem do cabeçalho e distribuição vertical. |
| 3 | `comparison-cycle-3.png` | Ausência de scrollbar adicionava 8 px à largura; margens herdadas afastavam progressivamente os itens da rail. Fixados padding/largura máxima e margens dos itens. |
| Final | `comparison-final.png`, `server-settings-final.png` | Composição completa na altura do alvo. Dados, limite de nome e bitmap continuam próprios do projeto. |

As três comparações combinadas foram inspecionadas, incluindo detalhes em escala nativa. Houve mais uma conferência final após esses ajustes. Geometria registrada: sidebar 254 px; título e cards em x=394; largura 1162 px; identidade y=119/h=295; onboarding h=248; management y=694/h=151; Danger zone y=859/h=67. A navegação foi ajustada posteriormente apenas para remover o acúmulo de margens entre itens.

### Funcionalidade e estados

- Prévia com dados locais, indicação explícita de alterações não salvas e retorno à edição sem publicar.
- Recorte e envio reais de ícone/banner/welcome banner; imagens ficam locais até Save changes. Reset descarta o rascunho. Remover retorna ao banner herdado/padrão conforme o campo.
- Salvamento transacional de nome, descrição, imagens e onboarding; status de sucesso/erro, campos desabilitados durante gravação e proteção contra descarte acidental. Atualizações periódicas não sobrescrevem a edição.
- Canal inicial escolhido entre canais de texto elegíveis para novos membros; permissões de categoria consideradas; destino excluído ou inacessível usa fallback seguro.
- Boas-vindas reconhecidas uma vez por vínculo, persistentes após recarga e sem inserção/duplicação de mensagens no chat. `server-welcome-new-member.png` mostra o fluxo real de entrada do teste; `server-preview-unsaved.png` mostra o rascunho.
- Atalhos abrem convites, permissões de @everyone e membros/moderação existentes. Exclusão permanece só do proprietário, com confirmação explícita; o teste cancela a operação.
- Capturas e ausência de overflow horizontal verificadas em 760 × 700, 1080 × 680, 1280 × 800 e 1920 × 1080. A redução do tamanho mínimo da janela ocorreu apenas no teste para exercer 760 px.
- Nomes acessíveis para câmera, remoção, campos, seletor e navegação; foco visível e componentes Radix existentes para modais e seleção. Transições discretas e respeito a prefers-reduced-motion nas animações CSS. Não se declara uma auditoria completa de acessibilidade.

### Diferenças e limites

A referência mostra quatro canais e uma data de 2024. O teste começa com dois canais, e a data vem do PostgreSQL local; esses valores não foram falsificados. O limite real do nome continua 60 em vez dos 100 mostrados no exemplo. O banner é um novo asset abstrato inspirado na linguagem visual, não uma reprodução pixel a pixel; nenhuma interface foi rasterizada. Imagens personalizadas preservam suas cores, enquanto o asset padrão recebe iluminação mais discreta. O trecho de boas-vindas adicional no preview também atende ao comportamento solicitado.

O asset `assets/server-banner-default.png` foi gerado e inspecionado com ImageGen; dimensões 2048 × 768, 1.76 MB. O prompt e os detalhes completos de componentes, endpoints, migração 10 e limitações estão em `server-settings.md`.

### Verificações finais

- TypeScript e 399 testes em 43 arquivos: aprovados. Usados dois processos para evitar timeouts de preparação dos bancos em concorrência com capturas.
- Fluxo Electron específico de identidade e onboarding: aprovado.
- Suíte Electron completa: nove testes aprovados. O novo teste isola o cache Vite e usa um perfil Electron separado para a pessoa convidada; a saída de conta continua coberta no teste de comunidades.
- Build de produção: aprovado. Permanece o aviso existente de bundle acima de 800 kB.
- git diff --check: aprovado.
- Dev em localhost:5173; API e LiveKit locais preservados. Sem commit, push, tag ou publicação.

final result: passed

---

## Roles — referência de 19/10/2026

### Alvo e evidência

Fonte visual: `C:/Users/Gamer/AppData/Local/Temp/codex-clipboard-ff4bf214-d5af-46f5-a504-e9ac515680a8.png`, **1790 × 878 pixels**. Implementação: Electron local do projeto, mesma dimensão de conteúdo/CSS, escala 1:1. As capturas possuem 1790 × 878 pixels, sem normalização ou moldura adicional. Estado comparado: Settings → Roles → Friend → Permissions → General, tema escuro, sem rascunho pendente. Banco e contas de teste isolados, APIs reais e PostgreSQL via PGlite. O limite mínimo da janela foi reduzido somente nos testes que exercitam 760 px.

Pasta de evidências: `C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-roles/`.

Implementação final: `roles-final.png`. Comparação final combinada: `comparison-final.png`, com visão completa lado a lado e recorte do cabeçalho/personalização em escala nativa. A referência e cada render foram vistos no mesmo documento comparativo. Os HTMLs correspondentes foram preservados.

Os dados ilustrativos não são o contrato de dados: a referência rotula o contador como 3, embora desenhe quatro linhas. A implementação conta os cargos configuráveis reais, incluindo @everyone, e mostra a propriedade do servidor fora dessa lista. O exemplo usa `@friend`, mas não há um username de cargo no modelo; aparece “Role · 0 members”. A descrição começa vazia porque não foi preenchida na criação dos dados de teste. Essas diferenças são intencionais e não foram contabilizadas como falhas visuais.

### Cinco diferenças principais encontradas e corrigidas

1. **[P1, resolvido] Composição anterior deslocada e estreita.** `roles-before.png` mostra conteúdo em x≈483, lista de aproximadamente 200 px e permissões extensas sem o cabeçalho da referência. O novo workspace inicia em x≈373, usa lista de 292 px, editor em x≈691 e alinhamento superior em y≈110. Evidência final: `comparison-final.png`.
2. **[P2, resolvido] Superfícies do primeiro render pouco diferenciadas.** O cabeçalho era uma faixa uniforme e o corpo muito escuro. Foram ajustados iluminação neutra do cabeçalho, contraste entre painel/campos e acabamento do avatar de iniciais. Evidência: comparação dos ciclos 1 e 3 e final.
3. **[P2, resolvido] Coluna de ícone deslocada e paleta com uma opção excedente.** No ciclo 1, a divisória avançava aproximadamente 22 px além do alvo. O grid de cor/ícone foi redistribuído, a opção duplicada removida e a cor personalizada mantida pelo seletor. Evidência: detalhes dos ciclos 1 e 2.
4. **[P2, resolvido] Espaçamento acumulado empurrava abas e cortava a quarta permissão.** As margens internas e os gaps da personalização foram reduzidos; a categoria General recuperou quatro linhas na altura do alvo. Evidência: `comparison-cycle-1.png` versus `comparison-final.png`.
5. **[P2, resolvido] Ritmo da rail e legibilidade da navegação.** O cabeçalho administrativo e os itens estavam mais baixos que o alvo; ícones e rótulos das categorias ficavam apagados. Foram ajustados padding, altura dos itens, escala e contraste. Evidência: ciclos 2/3 e final.

### Ciclos de revisão

| Estado | Evidência | Resultado |
| --- | --- | --- |
| Antes | `roles-before.png` | Layout anterior capturado antes da substituição do componente. |
| Ciclo 1 | `comparison-cycle-1.png` | Estrutura já funcional; ainda exigia contraste, grid de cor/ícone e redução do deslocamento vertical. Resultado intermediário bloqueado pelos P2 acima. |
| Ciclo 2 | `comparison-cycle-2.png` | Corrigidos grid, paleta e superfícies. Restavam acabamento das iniciais, espaçamento acumulado dos campos e ritmo da rail. Resultado intermediário ainda bloqueado. |
| Ciclo 3 | `comparison-cycle-3.png` | Corrigidos avatar, campos e rail. A conferência adicional em 760 px revelou que a lista horizontal ocupava altura demais; foi substituída por lista expandível/recolhível. |
| Final | `comparison-final.png`, `roles-final.png`, `roles-760.png` | Recomparação após as correções, mantendo geometria ampla e alternativa estreita acessível. Sem P0/P1/P2 pendentes identificados neste escopo. |

### Cinco superfícies de fidelidade

- **Fontes/tipografia:** preservada Schibsted Grotesk e os fallbacks do projeto. Título 28 px, cargo 21 px, rótulos e navegação de 12–13 px, descrições/contagens menores; pesos e truncamento permitem nomes reais. A família exata do mock não foi fornecida; não se afirma identidade de rasterização. A hierarquia e a escala foram conferidas no recorte nativo.
- **Espaçamento/ritmo:** lista de 292 px, separação próxima de 24 px, painel de 15 px de raio, cabeçalho de 116 px, avatar de 69 px e linhas de permissão de pelo menos 52 px. Lista e editor têm rolagens próprias; somente o conteúdo rola. A barra de alterações continua visível em 760/1080/1280/1920 px. Settings pode exigir rolagem para Danger zone; o controle permanece acessível.
- **Cores/tokens:** superfícies neutras em níveis distintos, campos escuros, bordas discretas e seleção grafite. As cores ficam nos indicadores, paleta e avatar, conforme a exceção explícita para cargos. Controles brancos e erros/destruição seguem o design system existente. O cabeçalho usa iluminação de superfície em CSS, sem bitmap de interface ou gradiente colorido amplo.
- **Imagem/assets:** o alvo permite iniciais quando não existe ícone; não foram inventadas fotografias, logos ou ilustrações. O fallback continua sendo o Avatar existente. Ícones de interface vêm da família Lucide já usada no aplicativo. Uploads reais foram recortados, substituídos, persistidos e removidos no teste Electron; não há asset novo ou interface rasterizada nesta etapa. A iluminação do cabeçalho não reproduz pixel a pixel a textura do mock, diferença residual de acabamento classificada como P3 aceitável.
- **Copy/conteúdo:** título, descrição principal, categorias e ações correspondem ao alvo. Contagens e usernames de membros vêm do serviço. A UI explica permissões herdadas, Administrator e hierarquia sem criar funcionalidades fictícias. Não foram introduzidos toggles de menção/visibilidade sem implementação real. Os textos permanecem em inglês, conforme o restante do produto.

### Estados e interações verificados

- Busca de cargos preserva o editor selecionado; busca de membros e busca na seleção funcionam com nomes/usernames reais.
- Criação, nome/descrição/cor, ícone com prévia/troca/remoção, Save/Discard, feedback de erro sem perda do rascunho e confirmações ao trocar de cargo, seção ou fechar.
- Atualização concorrente mantém o rascunho, retorna conflito e permite reaplicar somente as alterações locais. Mudanças remotas sem rascunho são incorporadas. Não há substituição silenciosa durante polling.
- Select all modifica somente a categoria e permissões concedíveis. Administrator e concessões críticas em massa pedem confirmação. Overrides dos canais continuam com permitir/herdar/negar.
- Associação de dois membros em lote, remoção pelo menu, contagem atualizada e @everyone automático. Estado vazio discreto; loading desabilita ações e erro permanece visível no diálogo de adição.
- Reordenação por arraste e Alt + setas, proteção do proprietário/cargos superiores e exclusão confirmada. Ícone e cor também integram badges de perfil e lista administrativa.
- Tabs com setas/Home/End, foco visível, nomes acessíveis e menus/modais Radix existentes. CSS respeita prefers-reduced-motion. Não se declara auditoria integral de acessibilidade ou de zoom.
- Capturas em **760 × 700, 1080 × 680, 1280 × 800 e 1920 × 1080**; sem overflow horizontal no corpo nem no editor. A navegação horizontal das categorias em telas intermediárias é intencional e rolável; a lista de cargos estreita é recolhível.

### Verificação e limites da entrega

- TypeScript: aprovado.
- Testes unitários/API: **410 aprovados, 44 arquivos**.
- Suíte Electron completa: **10 aprovados**, incluindo Roles e regressão de chat, perfis, voz e configurações.
- Build de produção: aprovado; o bundle principal permanece acima do limite configurado de 800 kB, condição preexistente.
- git diff --check: aprovado. Dev/UI e API conferidos com HTTP 200, banco local preservado e copiado antes da migração 11.
- Sem commit, push, tag, release ou publicação. O relatório `roles-refactor.md` lista os componentes, arquivos, endpoints e mudanças no banco.

Os testes usam o aplicativo real com dados isolados; as capturas não representam os servidores reais do usuário. Validação não executada em Railway ou Android. Clientes legados que não enviam revisão continuam com a política de última gravação; a proteção otimista é utilizada pelo novo editor. Não há pendência funcional conhecida nos fluxos cobertos. A textura e a fonte exatas da imagem permanecem diferenças aceitáveis, sem promessa de equivalência pixel a pixel.

Checklist concluído: composição; personalização; navegação por categorias; associação real de membros; hierarquia; autorização; persistência; proteção de rascunho; revisão combinada em três ciclos e final; responsividade; regressão e build.

final result: passed
