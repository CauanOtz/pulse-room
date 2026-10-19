# Server Settings — implementação e validação

## Resultado

A tela Server foi reorganizada conforme a composição fornecida: navegação administrativa à esquerda; identidade horizontal com avatar, formulário e banner; estatísticas integradas; onboarding em duas colunas; três atalhos administrativos; e exclusão na faixa inferior. O aplicativo, a autenticação, os cargos e a chamada continuam usando os serviços existentes.

O servidor dev permanece em [localhost:5173](http://localhost:5173/). Não houve commit, push, alteração de versão ou publicação.

## Funcionalidades

- Nome e descrição persistentes, com limites de 60 e 200 caracteres e contadores. O limite de nome já existente foi preservado, embora o exemplo visual mostre 100.
- Ícone, banner do servidor e banner de boas-vindas com upload real, recorte, substituição e remoção. Sem uma imagem própria, o banner de boas-vindas usa o banner do servidor; sem ambos, usa o asset padrão.
- Prévia com nome, ícone, banner, descrição, estatísticas e mensagem reais. Alterações locais são identificadas como “Unsaved preview”.
- Salvamento conjunto e transacional, com Save changes, Reset, feedback de erro/sucesso e proteção ao navegar, fechar ou recarregar com alterações pendentes. Imagens recortadas só são enviadas ao salvar.
- Atualizações periódicas preservam o rascunho. Somente campos alterados são enviados, preservando mudanças concorrentes em outros campos.
- Canal inicial limitado a canais de texto acessíveis ao administrador e a novos membros por `@everyone`, considerando permissões de categoria. Exclusão ou perda de acesso usa o primeiro canal de texto disponível.
- Boas-vindas de até 300 caracteres, apresentadas uma vez por vínculo de membro no desktop. O reconhecimento é persistente e idempotente; nenhuma mensagem é inserida no chat. Membros anteriores à configuração não são apresentados como recém-chegados.
- Convites abrem o gerenciador existente. Default permissions abre as permissões de `@everyone`. Moderation & safety abre a administração real de membros; cargos e banimentos continuam na navegação. Não foram criados controles fictícios de filtro de conteúdo.
- Estatísticas usam membros, canais e data do banco. Administradores recebem a contagem total de canais sem revelar nomes de canais privados aos quais não têm acesso.
- Exclusão continua restrita ao proprietário e exige a confirmação existente.

## Arquivos deste escopo

| Arquivo | Mudança |
| --- | --- |
| `src/renderer/components/server-identity-editor.tsx` | Novo editor, banners, prévia, estatísticas e atalhos. |
| `src/renderer/components/server-welcome.tsx` | Boas-vindas e reconhecimento por membro. |
| `src/renderer/components/server-dialog.tsx` | Integração, proteção de rascunho e navegação administrativa. |
| `src/renderer/components/settings-screen.tsx` | Classe opcional para aparência específica do servidor. |
| `src/renderer/components/role-editor.tsx` | Seleção inicial opcional de cargo/aba para o atalho de permissões padrão. |
| `src/renderer/domain/landing-channel.ts` | Seleção e fallback do canal inicial. |
| `src/renderer/app.tsx` | Entrada no canal configurado, fallback após exclusão e boas-vindas. |
| `src/renderer/server-settings.css`, `src/renderer/theme.css` | Composição responsiva, superfícies e estados visuais. |
| `assets/server-banner-default.png` | Asset monocromático abstrato próprio. |
| `src/shared/community.ts` | Contratos opcionais e compatíveis com clientes anteriores. |
| `server/database.ts` | Migração 10. |
| `server/community-service.ts` | Leitura, salvamento, imagens pendentes, elegibilidade de canais e reconhecimento de boas-vindas. |
| `server/image-service.ts` | Autorização e coleta contemplando banners e uploads pendentes. |
| `server/app.ts` | Validação e rotas. |
| `tests/unit/server-settings-api.test.ts` | Oito testes de API/banco. |
| `tests/e2e/server-settings.spec.ts` | Fluxo integrado Electron, tamanhos e capturas comparativas. |
| `tests/e2e/community.spec.ts` | Fluxo de imagem/nome atualizado para o salvamento conjunto. |
| `design-qa.md` | Histórico das comparações e resultado da revisão. |

O diretório já continha outras alterações autorizadas de interface e chat; elas foram preservadas.

## Banco e API

A migração 10 adiciona descrição, dois identificadores de banner, canal inicial e mensagem em `communities`; `welcome_seen_at` em `memberships`; e `server_image_uploads`. As imagens continuam na tabela e no cache autenticado existentes. A migração é executada uma vez, na transação já usada pelo projeto. Há cópia do banco local anterior à migração em `pulse-room-dev/database-before-server-settings-20261019003807`, dentro da pasta de artefatos da sessão.

- `PATCH /api/servers/:serverId`: aceita os campos alterados e os salva na mesma transação. `{ name }` de clientes anteriores continua válido.
- `POST /api/servers/:serverId/appearance-images?kind=icon|banner|welcomeBanner`: valida e prepara uma imagem pendente, sem alterar a identidade publicada.
- `POST /api/servers/:serverId/welcome/ack`: reconhece as boas-vindas para o membro autenticado.
- `GET /api/servers/:serverId`: inclui identidade, estado de boas-vindas e, para administradores, destinos elegíveis e contagem de canais.

Manage server é verificado dentro da transação de gravação. Um hash de imagem conhecido não permite anexar imagens privadas de outro servidor ou de outro administrador. Uploads pendentes são vinculados a servidor, pessoa e finalidade; expiram em 24 horas e são coletados num próximo upload do mesmo servidor. Imagens ainda referenciadas são preservadas.

## Validação

- TypeScript: aprovado.
- `npm run test -- --maxWorkers=2`: **399 testes aprovados, 43 arquivos**. A primeira execução irrestrita teve dois timeouts de preparação de PostgreSQL durante concorrência com o teste visual; a repetição com dois processos passou integralmente.
- Teste integrado novo: aprovado, incluindo três recortes/uploads reais, prévia, Reset, aviso de descarte, persistência, remoção, atalhos, confirmação de exclusão sem executá-la, tamanhos 760/1080/1280/1920 e novo membro entrando em `arrivals` após boas-vindas e recarga.
- `npm run test:e2e`: **9 testes Electron aprovados**. O teste novo usa cache Vite isolado e um segundo perfil Electron para o convidado, evitando interferência de navegação após os uploads na janela administrativa. A saída de conta continua coberta pela suíte de comunidades.
- `npm run build`: **aprovado**, incluindo TypeScript, renderer, Electron e servidor. Permanece o aviso existente de bundle acima de 800 kB.
- `git diff --check`: aprovado.

Os testes usam contas e servidores isolados, APIs reais e PostgreSQL via PGlite. As capturas do teste não substituem os dados dos servidores locais do usuário.

## Revisão visual

Foram capturados o estado anterior, três iterações e a versão final em **1672 × 941**, a dimensão da referência. As comparações combinam a fonte e a captura, incluindo um detalhe em escala nativa.

1. Primeira iteração: composição presente, mas início do conteúdo aproximadamente 52 px à esquerda, campos altos, banner muito contrastado e Danger zone cortada. Corrigidos alinhamento, altura e contraste.
2. Segunda iteração: coluna próxima do alvo; onboarding ainda 10 px alto, margem direita e espaçamento da navegação precisavam de ajuste. Corrigidos textarea, cabeçalho, padding e margens.
3. Terceira iteração: todos os blocos cabiam, mas a ausência da barra de rolagem aumentou a largura em 8 px. A largura útil, o limite máximo e a margem foram corrigidos. Removidas margens herdadas que acumulavam distância entre os itens da navegação.

Geometria final: sidebar 254 px; conteúdo em x=394; cards de 1162 px; primeiro card em y=119 e altura 295 px; onboarding de 248 px; management de 151 px; Danger zone de 67 px. A captura final inclui também o ajuste das margens da navegação. Os dados de criação e contagem diferem da referência porque vêm do banco de teste.

Pasta de evidências: `C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-server-settings/`.

| Evidência | Arquivo |
| --- | --- |
| Antes | `server-settings-before.png` |
| Iterações | `comparison-cycle-1.png`, `comparison-cycle-2.png`, `comparison-cycle-3.png` |
| Final | `server-settings-final.png`, `comparison-final.png` |
| Prévia | `server-preview-unsaved.png` |
| Entrada real | `server-welcome-new-member.png` |
| Responsividade | `server-settings-760.png`, `server-settings-1080.png`, `server-settings-1280.png`, `server-settings-1920.png` |

## Asset e limites

O banner padrão foi gerado com ImageGen e inspecionado visualmente. É uma imagem própria de 2048 × 768, sem interface, nomes ou ícones embutidos. O bitmap tem composição abstrata inspirada na linguagem da referência, sem copiar a screenshot. Os demais elementos são componentes reais.

Prompt usado:

> Use case: stylized-concept. Asset type: abstract default server banner image for a premium monochrome desktop voice-community application. Primary request: one wide landscape raster artwork, approximately 1600 by 600 pixels, consisting of softly folded silk-like fluid waves in very dark graphite and charcoal with fine, subdued silver edge highlights. Composition: elegant soft diagonal curves sweeping from lower left toward upper right, broad dark negative space across the center for interface text to be overlaid later, details remain effective when cropped centrally to 3.15:1 or 2.55:1. Lighting: low-key studio illumination, very subtle gradients, restrained sheen, soft atmospheric depth; mostly near-black, low contrast, only a few narrow gray highlights. Material: smooth satin-like sculptural folds, delicate fine surface grain. Constraints: absolutely monochrome neutral gray/black only, no colors, no text, no letters, no people, no icons, no logo, no watermark, no frames, no interface, no screenshot. Render only the seamless-feeling abstract banner artwork, edge to edge.

A aba antiga do navegador estava numa página de erro e sua inspeção foi bloqueada pela política do navegador. A validação visual foi feita no aplicativo Electron com contas de teste isoladas. Não se afirma equivalência pixel a pixel, execução em Railway ou auditoria completa de acessibilidade. A interface Android não foi alterada. Gravações simultâneas no mesmo campo seguem a última alteração salva. O aviso preexistente de tamanho de bundle permanece.
