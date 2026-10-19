# Roles — implementação e validação

Referência: `C:/Users/Gamer/AppData/Local/Temp/codex-clipboard-ff4bf214-d5af-46f5-a504-e9ac515680a8.png`, 1790 × 878. Implementação no projeto existente Electron/React/Fastify/PostgreSQL, sem alterar a versão ou publicar. A interface local permanece em http://localhost:5173/.

## Resultado

- Composição em três regiões, lista de 292 px na dimensão da referência, editor independente e superfícies grafite diferenciadas.
- Busca por nome, contagens reais, seleção, menus, arraste com indicador de destino e alternativa por teclado: focar o handle e usar Alt + seta para cima/baixo. As posições são persistidas. Em janelas estreitas, a lista pode ser expandida/recolhida.
- Cabeçalho com iniciais ou imagem real do cargo, nome e quantidade de membros. Edit role leva ao campo já existente.
- Cor padrão, paleta e seletor personalizado; descrição opcional e contadores; envio, recorte, prévia, substituição e remoção de ícone. As mudanças ficam locais até Save changes.
- Abas Permissions, Members e Settings preservam a edição. Barra Save changes/Discard, feedback de gravação e erro e confirmação antes de sair com alterações pendentes.
- Permissões agrupadas por finalidade; Select all atua somente na categoria atual e nas permissões que a pessoa pode conceder. Operações em massa com permissões críticas e Administrator pedem confirmação.
- Members tem busca, seleção de vários membros existentes, associação em uma transação e remoção pelo menu. A operação modifica somente aquele cargo e preserva os outros cargos de cada pessoa.
- Settings reúne o agrupamento real de membros por cargo, hierarquia e exclusão com confirmação. @everyone permanece protegido.
- Ícones dos cargos aparecem também nos badges da lista administrativa e nos perfis.

## Semântica e autorização

As permissões dos cargos continuam **aditivas** com @everyone. Desativar uma concessão do cargo não é uma negação: a UI informa quando a permissão vem de @everyone e quando Administrator concede acesso efetivo. O modelo de três estados das sobrescritas de canais/categorias permanece intacto.

Todas as mutações verificam Manage roles e hierarquia no servidor, dentro do bloqueio transacional do servidor. Proprietário e cargos superiores permanecem protegidos. Tanto a associação nova quanto a associação legada impedem conceder um cargo com permissões que o autor não possui; isso fecha a possibilidade de conceder um cargo inferior com Administrator a si mesmo.

`revision` e `expectedRevision` detectam gravações concorrentes. A interface preserva o rascunho e oferece carregar a versão atual ou reaplicar somente os campos e bits de permissão alterados localmente, antes de salvar novamente. Reordenação envia `expectedOrder` e rejeita uma lista desatualizada. A associação em lote é uma alteração incremental, sem substituir a lista inteira de cargos do membro.

Owner é o status real do proprietário, mostrado separadamente. Nenhum cargo Owner, perfil, descrição ou membro fictício foi adicionado ao banco local para imitar o exemplo.

## Arquivos desta etapa

| Área | Arquivos |
| --- | --- |
| Componente de entrada preservado | `src/renderer/components/role-editor.tsx` reexporta o novo workspace |
| Componentes criados | `role-workspace.tsx`, `role-details-editor.tsx`, `role-appearance.tsx`, `role-permissions.tsx`, `role-members.tsx`, todos em `src/renderer/components/` |
| Estilos e integração | `src/renderer/roles.css`, `src/renderer/theme.css`, `src/renderer/components/server-dialog.tsx` |
| Badges existentes | `src/renderer/components/member-manager.tsx`, `profile-popover.tsx`, `profile-modal.tsx` |
| Contrato e leitura | `src/shared/community.ts`, `server/access.ts` |
| Persistência e regras | `server/database.ts`, `server/role-service.ts`, `server/image-service.ts`, `server/app.ts` |
| Testes novos | `tests/unit/role-workspace.test.ts`, `tests/e2e/role-workspace.spec.ts` |
| Testes adaptados | `tests/unit/roles-ui.test.tsx`, `tests/e2e/roles.spec.ts` |
| Documentação | `roles-refactor.md`, seção Roles em `design-qa.md` |

Os demais arquivos já modificados na árvore pertencem às etapas anteriores e foram preservados.

## Banco e endpoints

Migração **11**, repetível e sem recriar dados: `roles.description` (até 200 caracteres), `roles.icon_id` e `roles.revision`; tabela `role_image_uploads` para uploads pendentes vinculados a servidor, cargo e autor. A posição persistente já existia. Nenhum novo bit de permissão foi criado.

- POST `/api/servers/:serverId/roles`: descrição opcional; criação inicia sem permissões implícitas adicionais.
- PATCH `/api/servers/:serverId/roles/:roleId`: campos parciais, descrição, ícone e revisão esperada. Payloads antigos continuam aceitos.
- PUT `/api/servers/:serverId/roles`: ordem completa, com snapshot opcional da ordem esperada.
- POST `/api/servers/:serverId/roles/:roleId/icon`: prepara uma imagem pendente, ainda sem alterar a aparência publicada.
- PATCH `/api/servers/:serverId/roles/:roleId/members`: `addUserIds`/`removeUserIds`, até 100 por lista, validação de todos os alvos antes de gravar.
- DELETE de cargo: preserva a limpeza de associações/sobrescritas, recolhe ícone e uploads pendentes sem referência e fecha a sequência de posições.

O arquivo de origem do ícone pode ser PNG, JPEG, WebP ou GIF, até 2 MB. O recorte utiliza o pipeline existente e prepara um formato aceito pelo serviço; SVG não é aceito. O limite existente para ícones estáticos preparados é 256 KiB, mais restrito que o limite do arquivo original; o recorte prepara a imagem dentro desse limite. Imagens pendentes são legíveis apenas pelo autor ainda membro, expiram em 24 horas e são coletadas em um upload posterior do mesmo servidor. Depois de salvar, membros do servidor podem ler o ícone; pessoas externas recebem 404. Um hash conhecido não permite anexar um upload destinado a outro cargo/autor.

A API dev foi encerrada graciosamente e o banco persistente foi copiado antes da inicialização com a migração. Os servidores e vínculos locais foram mantidos.

## Evidência visual

Pasta: `C:/Users/Gamer/.codex/visualizations/2026/10/18/01a14db0-e26c-7cf2-9c36-5b067ff9fa68/pulse-room-roles/`.

- Antes: `roles-before.png`.
- Três ciclos: `comparison-cycle-1.png`, `comparison-cycle-2.png`, `comparison-cycle-3.png`.
- Entrega: `roles-final.png`, `comparison-final.png`.
- Fluxos reais: `roles-members.png`, `roles-settings.png`.
- Dimensões adicionais: `roles-760.png`, `roles-1080.png`, `roles-1280.png`, `roles-1920.png`.

As comparações apresentam referência e aplicação juntas, com detalhe em escala nativa. As contas e os dados dessas capturas pertencem a um banco de testes isolado, usando os serviços reais. A revisão detalhada das diferenças e das cinco superfícies obrigatórias está em `design-qa.md`.

## Verificações

- TypeScript: aprovado na implementação.
- Testes unitários/API: **410 testes aprovados em 44 arquivos**, com dois processos. Um teste novo aguardava o feedback de erro antes do término do estado de gravação; foi corrigido para aguardar a liberação do controle antes de tentar navegar.
- Suíte Electron completa: **10 testes aprovados**, incluindo o novo fluxo de Roles, a reordenação por arraste/teclado, o conflito de edição, duas substituições de ícone, associação/remoção de membros e o painel recolhível em 760 px. Chat, perfil, voz e Server Settings anteriores também passaram.
- `npm run build`: **aprovado**, incluindo TypeScript, renderer, Electron e servidor. O bundle principal de produção continua acima do limite configurado de 800 kB; divisão de bundle não faz parte desta etapa.
- `git diff --check`: aprovado. UI e API locais responderam HTTP 200 na conferência final.

## Limites

- Não foram adicionados Mentionable role ou Role visibility: essas opções não têm comportamento implementado no mecanismo atual. O agrupamento de membros utiliza a opção real `hoist`.
- Compatibilidade preservada: clientes antigos que omitem a revisão continuam com a política de última gravação; o novo editor sempre envia a revisão.
- Android, Railway, release, instalador, versão, commit e push não fazem parte desta entrega.
- A família tipográfica existente e o ícone padrão são preservados. Contagens, @everyone, estado Owner e textos reais podem diferir do exemplo. Não se afirma equivalência pixel a pixel ou auditoria completa de acessibilidade/segurança.
