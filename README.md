# RL Barbearia

Sistema web de agendamento da RL Barbearia separado em duas entradas:

- Cliente: `/`
- Administrativo: `/admin/`

## Arquivos principais

- `index.html`: entrada da área do cliente.
- `client-app.js`: lógica da área do cliente.
- `admin/index.html`: entrada do painel administrativo.
- `admin/admin-app.js`: lógica do painel administrativo.
- `styles.css`: visual compartilhado.
- `assets/`: imagens e logos usadas pelo sistema.

## Publicação

Suba a pasta inteira do projeto para a hospedagem.

A área do cliente deve abrir pela raiz do site:

```text
https://seudominio.com/
```

O painel administrativo deve abrir somente pela rota:

```text
https://seudominio.com/admin/
```

Não existe botão de administrador na área do cliente.
