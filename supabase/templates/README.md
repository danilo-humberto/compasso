# E-mail de convite

- Assunto: **Seu convite para o Compasso**
- Corpo: `invite.html`
- Destino: Supabase → Authentication → Emails → Invite user.

O arquivo é a fonte do modelo; o deploy do frontend e das Edge Functions não atualiza esse template automaticamente. Sua publicação no Supabase exige autorização para produção.

Preserve `{{ .ConfirmationURL }}` nos dois links. O Supabase substitui a variável pelo link de ativação do convite. Não substitua por uma URL fixa do aplicativo.

O layout usa tabelas de apresentação, estilos inline e fontes do sistema, sem imagens externas. Para pré-visualizar, abra o HTML no navegador. Após publicar, valide um convite autorizado em um cliente de e-mail, incluindo o fluxo para definir a senha.
