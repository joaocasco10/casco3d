# CASCO 3D

Sistema local de gestão de pedidos de impressão 3D, sem dependências externas de servidor. Requer Node.js 22 ou superior.

Execute `npm start` ou `node server.mjs` nesta pasta e abra http://localhost:3000. Na primeira abertura, cadastre nome, e-mail e senha do administrador. O cadastro inicial se encerra após a criação do primeiro administrador. Não há senha padrão.

Inclui pedidos com fotos, cliente, contato, canal, quantidade, material, cor, datas, status, responsável, observações, custos totais e lucro estimado; catálogo reutilizável; busca, filtro e exportação CSV. O calculador considera gramas totais / 1000 × preço por kg e horas totais × watts / 1000 × tarifa por kWh.

Os registros e fotos ficam em `data/db.json`; os arquivos de impressão ficam em `data/uploads`. Faça cópias de segurança de toda a pasta `data` com o servidor parado. O CSV não inclui fotos nem arquivos. Não apague a pasta para atualizar a aplicação. As sessões expiram após 8 horas e são encerradas quando o servidor reinicia. As senhas são armazenadas como hashes scrypt com salt individual.

João é o superadministrador. Em **Meu perfil → Administradores**, somente ele pode cadastrar os acessos de Ingrid e Raissa, definindo e-mail e senha inicial. Elas entram como administradoras normais e podem gerir pedidos, catálogo e consultar resultados, sem acesso ao gerenciamento de contas. O superadministrador não pode ser removido. Na atualização de uma base antiga sem perfis, a primeira conta cadastrada recebe o perfil de superadministrador e as demais tornam-se administradoras.

Por padrão, o servidor aceita conexões apenas no próprio computador. Para disponibilizar em rede ou internet, configure hospedagem com HTTPS, cópias de segurança e controle de acesso antes de definir HOST. A publicação online ainda não está configurada.

As fontes do Google são opcionais; sem internet, a interface utiliza fontes do sistema.

## Energia e arquivos de impressão

A configuração inicial é **Bambu Lab A1, 100 W médios estimados**, com **Copel, Curitiba, R$ 0,768/kWh**, tarifa informada pelo proprietário. Os 100 W são uma hipótese de trabalho e podem ser ajustados a partir de medição real; não representam uma medição da impressora nem a potência máxima de aquecimento.

Somente o superadministrador altera esses valores em **Meu perfil → Energia**. Nos pedidos, informe as horas totais de impressão de todas as unidades (por exemplo, 1,5 para uma hora e meia). Consumo = horas × watts ÷ 1000. Custo = consumo × tarifa. O sistema calcula automaticamente, inclusive no servidor, e arredonda o custo final para centavos. Com os valores iniciais, 10 horas consomem aproximadamente 1 kWh e custam R$ 0,77. A tarifa é fixa até ser alterada; o sistema não consulta automaticamente reajustes, bandeiras ou tributos.

Pedidos novos guardam sua base de cálculo. Alterações de configuração não modificam os pedidos anteriores; ao alterar as horas de um pedido, sua tarifa e potência originais continuam sendo usadas. Pedidos antigos que ainda têm custo manual mantêm seus valores até serem editados e salvos com o novo cálculo.

Pedidos e produtos do catálogo podem ter foto e um arquivo de impressão de até 50 MB: STL, 3MF, GCODE, BGCODE, OBJ, STEP, STP ou ZIP. Selecione o arquivo e salve o registro para enviá-lo; depois use **Baixar** ao abrir o registro. Ao selecionar um produto do catálogo, seu arquivo também é reutilizado. Os downloads exigem login. O servidor armazena os arquivos sem executá-los. Remover o vínculo de um arquivo não apaga o conteúdo de `data/uploads`, pois ele pode estar compartilhado com outros registros.

## Vendedores e resultados

Os vendedores disponíveis são somente **João, Ingrid e Raissa**. Selecione o vendedor no cadastro de cada pedido. Essa informação é independente do administrador que registrou o pedido. Pedidos antigos continuam sem vendedor até serem editados e atribuídos.

A visão geral mostra os resultados de todo o período para cada vendedor: quantidade de pedidos, em aberto, entregues, cancelados, valor dos pedidos, custos, lucro estimado e ticket médio. Valores, custos, lucro e ticket médio excluem pedidos cancelados. Ticket médio é o valor dos pedidos não cancelados dividido pela quantidade desses pedidos. Os valores são de venda, não de pagamentos recebidos. Pedidos antigos sem vendedor aparecem em um grupo separado. Na aba Pedidos, filtre por vendedor; o CSV também inclui essa informação.

## Recuperação de senha

Enquanto estiver conectado, abra **Ativar recuperação** (ou **Recuperação de senha**) no menu. Confirme sua senha atual, gere o código e guarde-o fora do sistema. Ele é exibido apenas uma vez. Cada administrador gera o próprio código; gerar outro invalida o anterior.

Se esquecer sua senha, clique em **Esqueci minha senha** na tela de login e informe e-mail, código e a nova senha (10 a 256 caracteres). O código é consumido e todas as sessões da conta são encerradas. Após entrar, gere um novo código.

Contas existentes precisam ativar a recuperação antes de perder o acesso. Não há envio de e-mail nesta versão local. Sem um código previamente gerado ou uma sessão aberta, esse fluxo não recupera a conta. Os códigos ficam armazenados apenas como hashes com salt individual, e há limite de tentativas.
