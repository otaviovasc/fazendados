# fazendados

Administração de senhas em `/admin`: configure no servidor, em `app/.env`:

```dotenv
ADMIN_PASSWORD=coloque-aqui-uma-senha-exclusiva-longa
```

Use de 20 a 200 caracteres e reinicie a API depois de configurar ou trocar a
senha. Em produção, configure a mesma variável no ambiente do serviço e use
HTTPS. Nunca use `VITE_ADMIN_PASSWORD`: o segredo deve permanecer no servidor.
Deixar `ADMIN_PASSWORD` vazia desativa a API administrativa.

Abra `/admin`, entre com essa senha, busque o usuário e escolha **Redefinir
senha**. Confirme uma nova senha com pelo menos 12 caracteres. A alteração
encerra as sessões desse usuário e registra auditoria na Fazenda correspondente.
O login administrativo é separado do login dos usuários e permite gerenciar
senhas de todas as Fazendas.
