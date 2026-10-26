# Compasso

**Controle de batidas de ponto, jornadas e pontualidade em um só lugar.**

O Compasso é um projeto freelancer de aplicação web para acompanhar registros de ponto importados de planilhas Excel. A ferramenta organiza as batidas por colaborador e contrato, compara os horários com as jornadas cadastradas e apresenta indicadores para apoiar a conferência da operação.

O sistema analisa os registros enviados na planilha. Não cria dias ausentes, não presume faltas e não realiza marcação de ponto em tempo real.

## Funcionalidades

- **Importação de Excel:** leitura de `.xlsx`, validação e atualização incremental da base, com feedback de sucesso ou erro.
- **Visão geral:** horas registradas, horas previstas comparáveis, saldo informativo e registros que precisam de conferência.
- **Filtros:** consulta por mês, contrato/localização e colaborador.
- **Pontualidade por contrato:** gráficos de pizza com percentuais de entradas e retornos no horário ou em atraso, até quatro contratos por página.
- **Ranking de colaboradores:** classificação pela proximidade das batidas ao horário previsto, com ordenação pelos cabeçalhos da tabela.
- **Registros de ponto:** tabela detalhada com batidas, horas, saldo, situação e comparação dos horários de entrada e retorno.
- **Jornadas:** configuração semanal por contrato e exceções individuais, com folgas e até dois períodos por dia.
- **Histórico de importações:** data, autor e contagens das alterações realizadas na base.
- **Acesso autenticado:** login, convite e recuperação de senha pelo Supabase.
- **Interface responsiva:** adaptação para desktop e celular, com explicações dos indicadores nos ícones de informação.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Interface | React, TypeScript e CSS |
| Desenvolvimento e build | Vite |
| Gráficos | Chart.js |
| Leitura de planilhas | SheetJS |
| Banco e autenticação | Supabase, PostgreSQL e Supabase Auth |
| Testes | Vitest, Testing Library e Playwright |
| Qualidade | TypeScript estrito, ESLint e Prettier |

A interface acessa os dados por uma camada de serviços. As operações de gravação passam por funções PostgreSQL chamadas via RPC, com validação no servidor. O build da interface é estático e pode ser hospedado separadamente do Supabase.

## Executar localmente

### Pré-requisitos

- Node.js 22.14 ou superior e npm.
- Um projeto Supabase configurado para o ambiente utilizado.
- Um usuário convidado para acessar a aplicação.

### Instalação

```sh
npm ci --legacy-peer-deps
```

O parâmetro `--legacy-peer-deps` contorna uma falha conhecida do resolvedor npm com dependências opcionais do Vitest neste projeto. Use o arquivo de lock para manter as versões reproduzíveis.

Copie `.env.example` para `.env.local` e configure:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON
```

Use somente a chave pública destinada ao cliente. Nunca coloque a chave `service_role`, senhas do banco ou outros segredos em variáveis `VITE_*`, pois seus valores são incorporados à aplicação entregue ao navegador.

Inicie o servidor:

```sh
npm run dev
```

Acesse [http://127.0.0.1:5178](http://127.0.0.1:5178). A porta é fixa. Reinicie o servidor depois de alterar as variáveis de ambiente.

### Configuração do Supabase

1. Aplique os arquivos de `supabase/migrations/` em ordem de nome no ambiente autorizado. Em instalações existentes, aplique apenas os arquivos ainda pendentes.
2. Desative o cadastro público no Supabase Auth e convide os usuários pelo painel administrativo.
3. Configure a URL da aplicação em **Site URL** e nas URLs de redirecionamento permitidas.
4. Configure o envio de e-mails para convites e recuperação de senha.

Todos os usuários convidados têm acesso à mesma base e aos contratos disponíveis. A aplicação não possui segregação de dados entre empresas ou contratos.

## Como usar

1. Entre com seu e-mail e senha.
2. Acesse **Importar base** e selecione a planilha de ponto.
3. Aguarde a validação e o feedback da importação.
4. Cadastre as jornadas por contrato e, quando necessário, as exceções individuais.
5. Consulte os indicadores na **Visão geral** e os detalhes em **Registros de ponto**.

### Formato da planilha

O arquivo deve ser `.xlsx`, conter uma única aba, ter até **20 MB** e respeitar o limite de **50 mil registros** por importação.

São necessários os campos de matrícula, nome, localização, data lógica, data da batida e os quatro campos de data/hora das batidas. A descrição da escala é opcional. CPF é ignorado e não é enviado ao banco.

- A importação começa ao selecionar o arquivo, sem prévia ou confirmação adicional.
- **Cada arquivo incrementa a base de ponto**: registros novos são adicionados; registros da mesma matrícula e data lógica são atualizados sem duplicação. Meses e linhas ausentes do arquivo permanecem na base, inclusive em reenvios parciais de um mês.
- Jornadas, usuários e histórico de importações são preservados.
- Arquivos inválidos ou com duplicidades conflitantes são rejeitados integralmente.
- Linhas enviadas com batidas vazias permanecem como pendências; datas sem linha na planilha não são acrescentadas.
- Os sufixos `D` e `*` são tratados durante a leitura, preservando data e horário. O arquivo original não é modificado.
- Fórmulas do Excel não são executadas; a leitura utiliza os resultados disponíveis no arquivo.

A importação ocorre em uma transação: o servidor valida todo o arquivo e confere a gravação dos registros enviados, sem excluir os anteriores. Um erro desfaz toda a operação. Reenviar o mesmo arquivo não duplica registros; reenviar uma linha corrigida atualiza seu conteúdo. O aplicativo não armazena o arquivo Excel nem versões anteriores das linhas atualizadas; conserve os arquivos de origem e os backups necessários.

## Regras de cálculo

### Horas e saldo

- Quatro batidas válidas permitem somar dois períodos de trabalho.
- Duas batidas permitem cálculo quando a jornada admite um período.
- No sábado sem períodos configurados (inclusive sem jornada cadastrada), a diferença entre as batidas 1 e 2 conta integralmente como hora extra no saldo informativo, com previsto zero e sem avaliação de atraso. Nesse caso, batidas 3 e 4 não entram no cálculo. Entrada e saída ausentes, inválidas ou fora de ordem continuam pendentes. Se houver períodos configurados no sábado, prevalecem as regras da jornada, respeitando a prioridade da exceção individual.
- Batidas incompletas ou fora de ordem ficam pendentes; o sistema não reorganiza horários automaticamente.
- Datas completas permitem calcular períodos que atravessam a meia-noite. As datas são tratadas sem conversão pelo fuso do navegador.
- Sem jornada, as horas calculáveis são mostradas, mas não há saldo, salvo a regra de sábado descrita acima.
- O saldo compara horas realizadas e previstas nos mesmos dias válidos. Por isso, o total de horas registradas pode diferir do total realizado comparável.
- Uma exceção individual tem prioridade sobre a jornada do contrato.
- Há uma jornada por contrato ou colaborador, sem datas de vigência. Alterações recalculam todos os registros aplicáveis da base.

O saldo é informativo. A ferramenta não aplica regras legais de horas extras, tolerâncias, férias, feriados ou adicionais e não substitui a apuração da folha de pagamento.

### Atrasos e gráficos

A avaliação compara entradas e retornos com os inícios dos períodos da jornada. Saídas posteriores não compensam atrasos. Nos gráficos de pizza, marcações antecipadas entram na categoria **No horário**; saídas não compõem os percentuais.

Dias sem jornada, com batidas inválidas ou incompatíveis com os períodos não são tratados como pontuais: ficam sem avaliação. Os indicadores utilizam somente os registros enviados e respeitam os filtros selecionados.

### Ranking de pontualidade

O ranking agrupa os registros por matrícula e usa o **desvio absoluto médio em minutos** entre entradas/retornos registrados e previstos. Quanto menor o desvio, maior a proximidade do horário correto. Antecipações e atrasos não se compensam.

A tabela mostra batidas exatas, antecipadas, atrasadas e dias sem avaliação. Sem batidas avaliáveis, o colaborador fica sem posição. Os cabeçalhos alternam a ordenação; a posição por proximidade é preservada. Empates são apresentados por nome e matrícula.

## Estrutura do projeto

```text
src/
  app/                  Sessão de trabalho, navegação e filtros
  features/
    auth/               Login e recuperação de acesso
    dashboard/          Indicadores, gráficos e ranking
    imports/            Importação e histórico
    records/            Consulta detalhada das batidas
    schedules/          Gerenciamento de jornadas
    shared/             Componentes e notificações compartilhados
  domain/               Tipos e regras de cálculo
  importing/            Leitura e normalização das planilhas
  data/                 Cliente, contratos e serviços Supabase
supabase/migrations/    Estrutura do banco e operações transacionais
tests/
  e2e/                  Fluxos de navegador
  integration/          Validação do banco PostgreSQL
```

## Verificações de qualidade

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Para executar os testes de navegador:

```sh
npx playwright install chromium
npm run test:e2e
```

Os testes E2E utilizam a porta **5179**, dados sintéticos e API Supabase simulada, em desktop e celular. Eles não validam o envio real de e-mails ou o serviço de autenticação hospedado.

### Integração com PostgreSQL local

Com Docker disponível, use exclusivamente um ambiente descartável. A senha abaixo é sintética e destinada apenas ao teste local:

```sh
docker run --detach --rm --name compasso-test-20261023 --publish 127.0.0.1:55439:5432 --env POSTGRES_PASSWORD=synthetic-test-only postgres:17-alpine
node tests/integration/database.mjs
```

O script recria o banco local `compasso_test` e verifica permissões, atomicidade, concorrência, importação e jornadas. A identidade de autenticação é simulada; esse teste não substitui a validação com Supabase Auth real. Não execute os testes contra produção.

Ao terminar:

```sh
docker stop compasso-test-20261023
```

## Publicação

Gere o build com as variáveis do ambiente de destino:

```sh
npm run build
```

Publique a pasta `dist/` em uma hospedagem estática. O banco e a autenticação permanecem no Supabase. As variáveis `VITE_*` são incorporadas no build; alterações exigem uma nova geração e publicação.

Configure HTTPS, a URL pública e os redirecionamentos de autenticação. Valide login, convite, recuperação de senha e importação no ambiente publicado. A publicação da interface e a aplicação das migrations são operações separadas.

## Manutenção e limites

- A consulta carrega a base em uma RPC para manter uma visão consistente. Volumes maiores exigem avaliar paginação e agregação no servidor.
- Uma gravação com revisão desatualizada é rejeitada para evitar sobrescrever alterações concorrentes.
- Excluir uma jornada exige confirmação e preserva as batidas, recalculando os resultados. Não há desfazer na interface.
- Jornadas, contratos e colaboradores de meses anteriores continuam disponíveis após novas importações. Para editar uma jornada legada cujo destino não esteja na base acumulada, selecione um destino existente.
- Não há edição manual de batidas, justificativas de pendências ou restauração automática de importações anteriores.
- Mantenha os tipos de `src/data/database.types.ts` compatíveis com o schema após alterações no banco.

### Atualização de instalações existentes

A migration `202610230002_replace_only.sql` substitui a assinatura antiga da RPC de importação; coordene sua aplicação com a atualização da interface. As migrations seguintes incluem exclusão de jornadas e identificação do autor no histórico.

A migration `202610260003_schedules_without_validity.sql` remove as datas de vigência das jornadas. Faça backup recuperável antes de aplicá-la. Se houver múltiplas jornadas para o mesmo destino, ela aborta: escolha qual manter e remova as duplicadas antes de tentar novamente. Durante essa transição, a interface permite gerenciar jornadas e suspende os cálculos até resolver o conflito.

A migration `202610260004_incremental_import.sql` muda a importação para incremental, preservando os dados existentes e as permissões da função. A RPC passa de `import_records` para `import_records_incremental`; a antiga deixa de existir para impedir substituições por clientes desatualizados. Aplique a migration no ambiente autorizado e publique a interface correspondente. A interface nova recusa importar em um banco antigo, sem tentar a função de substituição. Clientes antigos precisam ser atualizados antes de voltar a importar. As novas entradas do histórico usam `merge` e zero exclusões; entradas antigas são preservadas. A mudança não recupera dados excluídos por importações anteriores.
