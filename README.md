# Calculadora BPC — login com Google Sheets + Apps Script

O Supabase saiu. Agora a **planilha do Google é o banco de contas** e o **Apps Script é o servidor** que confere e-mail e senha. O site (HTML/CSS/JS) só conversa com esse script.

```
Navegador (site)  ──►  Apps Script (Code.gs)  ──►  Planilha (abas Usuarios, Sessoes, Codigos)
```

## Instalação (uns 10 minutos)

### 1. Crie a planilha
Crie uma planilha nova no Google Sheets, **privada**, com a conta Google que será a "dona" do sistema. Compartilhe só com quem pode administrar (veja "Segurança" abaixo).

### 2. Cole o servidor
1. Na planilha: **Extensões → Apps Script**.
2. Apague o código que vier e cole **todo** o conteúdo de `apps-script/Code.gs`.
3. Clique em **Salvar** (ícone de disquete).

### 3. Configure a planilha
1. Volte à planilha e **recarregue a página** (F5). Aparece o menu **Calculadora BPC**.
2. Clique em **Calculadora BPC → 1) Configurar planilha (primeira vez)**.
3. O Google pede autorização: *Continuar → escolha sua conta → Avançado → Acessar (não seguro) → Permitir*. (O aviso aparece porque o script é seu e não foi "verificado" pelo Google. É normal.)

### 4. Crie o primeiro administrador
**Calculadora BPC → Criar usuário** → digite o e-mail → digite `admin`. A senha gerada aparece na tela: anote.

### 5. Publique o servidor
1. No Apps Script: **Implantar → Nova implantação**.
2. Engrenagem ao lado de "Selecionar tipo" → **App da Web**.
3. **Executar como: Eu** · **Quem pode acessar: Qualquer pessoa**.
4. **Implantar** (autorize de novo se pedir) e **copie a URL** (termina em `/exec`).

> "Qualquer pessoa" se refere a quem pode *chamar* o endereço. Sem e-mail e senha válidos, ninguém entra, e a planilha continua privada.

### 6. Ligue o site ao servidor
Abra `config.js` e troque `COLE_AQUI_A_URL_DO_APP_DA_WEB` pela URL copiada.

### 7. Publique o site
Hospede a pasta (Netlify, GitHub Pages, etc.) e acesse `login.html`.

## Quando você alterar o Code.gs
Salvar não basta: **Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar**. A URL continua a mesma.

## Controlando tudo pela planilha

Aba **Usuarios**:

| Coluna | O que é | Pode editar à mão? |
|---|---|---|
| email | e-mail da conta | sim (minúsculas) |
| senha_hash / salt | senha embaralhada | **não** mexa |
| papel | `admin` ou `user` | sim (lista suspensa) |
| ativo | `SIM` ou `NAO` | sim: `NAO` bloqueia a pessoa sem apagar a conta |
| criado_em | data de criação | informativo |
| tentativas / bloqueado_ate | proteção contra tentativa de adivinhar senha | para desbloquear alguém: zere as duas |

- **Excluir conta:** apague a linha (ou use o botão no painel admin).
- **Criar conta:** menu *Calculadora BPC → Criar usuário*, ou o painel admin do site. Não digite contas direto na planilha: sem o hash a pessoa não consegue entrar.
- **Esqueci minha senha:** o site envia um código de 6 dígitos por e-mail (válido por 15 min).
- **Deslogar todo mundo:** menu *Encerrar todas as sessões*.

## Segurança (leia)
- **Quem edita a planilha manda no sistema** (pode virar admin trocando `papel`). Compartilhe a planilha só com administradores de confiança.
- As senhas ficam só como hash com salt. Mesmo assim, o hash é SHA-256 repetido (o Apps Script não tem bcrypt): senhas fracas ainda são arriscadas. A configuração `MIN_SENHA` exige 8 caracteres.
- Após 5 senhas erradas a conta fica bloqueada por 15 minutos.
- Como antes, a calculadora roda no navegador: o login controla quem vê a tela, não o cálculo em si.

## Limites do Apps Script
- Cada chamada demora cerca de 1 a 3 segundos (o login e o carregamento das páginas ficam um pouco mais lentos que no Supabase).
- O Google limita e-mails por dia (cerca de 100 em conta gratuita) e execuções por dia. Para uma equipe pequena ou média é suficiente.
- Se o login ficar lento, diminua `ITERACOES_HASH` no `Code.gs`.

## Arquivos
- `apps-script/Code.gs` — servidor (cole no Apps Script)
- `config.js` — URL do servidor
- `auth.js` — funções de login do site
- `login.html`, `forgot-password.html`, `app.html`, `admin.html` e seus `.js` — telas
- `styles.css` — visual
- Removidos: `signup.html`, `update-password.html` (agora dentro de `forgot-password.html`), `supabase-*`.
