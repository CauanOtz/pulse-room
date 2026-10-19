# Chat com mídia, emojis e reações

O compositor agora aceita arquivos pelo clipe, por arrastar e soltar e por colar
arquivos da área de transferência. É possível enviar apenas anexos ou adicionar
uma legenda. A prévia permite remover arquivos antes do envio e mantém o
rascunho quando há uma falha. O seletor de emojis tem pesquisa e categorias.

As mensagens apresentam imagens ampliáveis, players de áudio e vídeo, arquivos
para download e reações com contagem por pessoa. Clicar na própria reação a
remove. Endereços HTTP e HTTPS são clicáveis; no desktop, abrem no navegador
externo, preservando a sala. Outros protocolos permanecem texto.

A lateral contém **Members / Media / Links**. O conteúdo compartilhado pertence
ao canal de texto selecionado; ao visualizar voz, usa o primeiro canal de texto
acessível. Members mantém uma lista compacta dos arquivos recentes. Media e
Links permitem consultar os anteriores. Estados vazios mostram uma explicação,
sem conteúdo inventado.

## Limites e persistência

- Até quatro arquivos por mensagem, com 25 MB por arquivo.
- PNG, JPEG, GIF, WebP, MP4, WebM, MP3, WAV, OGG, M4A, PDF e texto simples.
- O player depende dos codecs suportados pelo sistema; download continua
  disponível se o formato não puder ser reproduzido.
- Arquivos pendentes são privados para quem os enviou. A publicação associa
  todos os anexos à mensagem em uma transação.
- Leitura, envio e reações respeitam o acesso ao canal e as permissões existentes.
- A exclusão da mensagem remove seus arquivos e reações no banco.
- Os arquivos são guardados no PostgreSQL, com uma cota de 512 MB por pessoa
  em cada canal. Uploads pendentes com mais de 24 horas são limpos nos próximos
  uploads. Não há dependência de armazenamento externo.
- A migração 9 cria as tabelas de anexos e reações, preservando as mensagens
  existentes. Nenhum serviço foi publicado nesta alteração.

## Evidência visual

As capturas `rich-chat-conversation.png`, `rich-chat-media.png` e
`rich-chat-links.png` são produzidas pelo teste Electron com contas e arquivos
de teste, usando a API e o banco reais. Esses dados são isolados das contas do
ambiente de desenvolvimento. A imagem e o vídeo simples são fixtures de teste.

O refinamento visual usa uma grade de anexos na conversa, arquivos compactos
na lateral, separadores discretos e os mesmos tons neutros da sala.

## Validação

- `npm run verify`: aprovado, com 388 testes unitários e oito testes Electron.
- `npm run build`: aprovado para renderer, Electron e servidor.
- `git diff --check`: aprovado.
- O teste integrado verifica os quatro tipos de anexo, remoção antes do envio,
  inserção de emoji, reações de duas contas, ampliação, reprodução, download,
  abertura de links no navegador, abas, persistência após recarregar e exclusão.
- O ambiente local continua disponível em `http://localhost:5173`.

Nenhum commit ou push foi realizado.
