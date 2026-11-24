# Nexo — Gestão de estoque e entregas

Protótipo funcional para uma operação de distribuição de pequeno/médio porte. Reúne estoque, reposição, separação, expedição, acompanhamento de entregas e indicadores em uma interface responsiva em português.

## Como abrir

Abra `index.html` em um navegador moderno. Não é necessário instalar dependências nem configurar servidor. O sistema carrega com dados demonstrativos e salva as alterações no armazenamento local do navegador.

## Fluxo principal

1. **Estoque:** cadastre produtos, fornecedores, custos e níveis mínimos. Registre recebimentos, saídas avulsas e ajustes; cada alteração fica no histórico.
2. **Reposição e compras:** veja os produtos no nível mínimo e a quantidade sugerida para recompor até duas vezes o mínimo. O comprador envia uma solicitação com quantidade e justificativa; o Gerente de Operações aprova ou recusa. Após a aprovação, o Almoxarife registra a quantidade efetivamente recebida (inclusive recebimentos parciais), o que atualiza o estoque e cria uma movimentação rastreável.
3. **Entregas:** planeje pedidos com vários produtos, endereço, rota, previsão e frete. O pedido reserva unidades disponíveis.
4. **Expedição:** avance o pedido por *Planejada → Em separação → Em trânsito → Entregue*. Ao despachar, o sistema baixa as unidades e cria movimentos rastreáveis. Cancelamentos antes do despacho liberam as reservas.
5. **Relatórios:** acompanhe OTIF, lead time médio, custos de frete e valor de estoque; exporte CSVs ou uma cópia JSON.

## Regras e indicadores

- **Disponível** = estoque físico − itens reservados em entregas planejadas ou em separação.
- A criação da entrega verifica disponibilidade e impede reservar saldo insuficiente ou duplicar o mesmo produto no pedido.
- A baixa física ocorre uma única vez ao iniciar o trânsito. Não é permitido cancelar um pedido já despachado.
- **OTIF** considera pedidos entregues até a data prevista; cada item do pedido é controlado pela quantidade planejada.
- A sugestão de reposição recompõe o saldo disponível até duas vezes o estoque mínimo.
- Uma compra em andamento (aguardando aprovação, aprovada ou parcialmente recebida) bloqueia outra solicitação para o mesmo produto; uma nova pode ser feita após recusa ou recebimento total.
- Aprovar uma compra não altera o estoque. Apenas o Almoxarife ou o Gerente registra o recebimento aprovado e atualiza o saldo pela quantidade recebida.
- O alerta de atraso é calculado automaticamente comparando a data prevista com a data atual.

## Perfis e matriz RBAC

O seletor rápido no cabeçalho troca entre quatro usuários demonstrativos; a matriz em **Relatórios** documenta as permissões e os botões/rotas da interface refletem o perfil selecionado.

- **Gerente de Operações:** acesso operacional completo, aprova/recusa compras, registra recebimentos aprovados, cadastro, movimentos, entregas, relatórios e backup.
- **Almoxarife:** consulta e manutenção de produtos/estoque, registra recebimentos de compras aprovadas, separação e despacho; sem criação de pedidos ou acesso aos relatórios gerenciais.
- **Motorista / Roteirizador:** consulta de entregas e rotas e confirmação da entrega após o despacho.
- **Comprador / Suprimentos:** consulta de estoque e reposição, exportação das sugestões e envio/acompanhamento de solicitações de compra; sem alterações no saldo ou no cadastro.

Esta RBAC é uma demonstração de interface, não autenticação segura: os quatro perfis podem ser selecionados sem credenciais, e os dados ficam no mesmo navegador. A lista do motorista ainda não filtra rotas atribuídas. Em produção, o servidor deve autenticar usuários, restringir cada consulta e validar toda operação.

As exportações CSV/JSON permitem análise e troca inicial de dados; conectores com ERP, documentos fiscais, fornecedores, transportadoras, GPS e e-commerce são integrações futuras, não incluídas neste protótipo.

## Requisitos não funcionais considerados

- **Integridade:** validação de campos, bloqueio de saldo insuficiente, reserva de unidades e trilha de movimentações.
- **Desempenho e disponibilidade da demonstração:** aplicação estática, sem dependências externas; funciona localmente em navegador moderno.
- **Segurança e continuidade em produção:** armazenamento local facilita a demonstração, mas não substitui autenticação, autorização, backup gerenciado, criptografia e sincronização em servidor.

## Dados, privacidade e limites do protótipo

Este é um protótipo front-end para demonstração e uso local: não transmite dados para servidor e não requer login. Os registros ficam no navegador/dispositivo atual; use a exportação JSON para cópia de segurança. Acesso multiusuário, autenticação e autorização por perfil, sincronização entre unidades, integrações com ERP/transportadoras e atualização de localização exigem um backend com controles de segurança e infraestrutura adequados antes do uso em produção.

Os valores e pedidos iniciais são fictícios e servem para demonstrar os gargalos descritos na atividade: níveis de estoque, comunicação de reposição, rastreabilidade e atrasos de entrega.
