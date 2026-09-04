# Regimes de earnings e juros do Ibovespa

Decomposição do desempenho do Ibovespa em quatro quadrantes, cruzando a direção das expectativas de lucro com o ciclo de juros. A estrutura de saída segue o formato do Regime Monitor da XP Research, que cruza inflação com juros; aqui a primeira dimensão é substituída pela revisão de lucro.

Amostra de 03/04/2006 a 12/08/2026, com 5.036 pregões classificados, 29 episódios de earnings e 41 episódios combinados.

## A regra

**Earnings.** Inclinação OLS do log do BPA esperado 12 meses à frente sobre os últimos 63 pregões. O sinal é observado apenas no último pregão de cada mês. Inclinação positiva é `Earnings Up`, não positiva é `Earnings Down`. Uma virada exige dois fechamentos mensais consecutivos do lado oposto e passa a valer no pregão seguinte à segunda confirmação. Sem média móvel, sem winsorização, sem banda de histerese e sem ajuste pelo Focus.

**Juros.** Classificação `Hike` e `Cut` da série do swap Pré-DI de 360 dias, alinhada às datas publicadas pela XP. `Hike` é `Juros Up`, `Cut` é `Juros Down`.

**Retornos.** O retorno de fechamento a fechamento de `t` para `t+1` é atribuído ao regime vigente em `t`. Composição em log, anualização por 252 pregões. O retorno real desconta o IPCA mensal realizado, com o log da inflação do mês distribuído igualmente entre os intervalos de pregão daquele mês.

## Resultado

| Quadrante | % do tempo | Episódios | Retorno real anualizado | Mediana por episódio | Episódios positivos |
|---|---:|---:|---:|---:|---:|
| Earnings Up / Juros Down | 25,8% | 12 | +26,8% | +30,0% | 10 de 12 |
| Earnings Down / Juros Down | 25,7% | 9 | +8,4% | −4,2% | 4 de 9 |
| Earnings Up / Juros Up | 33,3% | 11 | −8,3% | −3,8% | 5 de 11 |
| Earnings Down / Juros Up | 15,3% | 9 | −18,3% | −20,0% | 2 de 9 |

O regime de juros é o principal separador: os dois quadrantes de `Juros Down` tiveram retorno real positivo e os dois de `Juros Up`, negativo. Dentro de cada regime de juros, `Earnings Up` melhora o resultado.

## O que os testes sustentam e o que não sustentam

Esta é uma decomposição histórica descritiva. Não é previsão, não é backtest de estratégia negociável e não é recomendação. A aba `Diagnostico` do workbook traz os testes abaixo.

**A dimensão de juros passa no teste.** Uma rotação circular do rótulo ao longo de todas as defasagens possíveis, que preserva integralmente a persistência do regime e sorteia apenas o timing, dá `p = 0,016` para o spread de juros.

**A dimensão de earnings não passa.** O mesmo teste dá `p = 0,32` dentro de `Juros Down` e `p = 0,51` dentro de `Juros Up`. O spread observado fica a cerca de um desvio-padrão da nula.

**A ordenação é consistente, a magnitude não.** Num corte triplo que controla juros e momentum de preço, o spread de earnings é positivo nos quatro blocos, entre +7,0 e +24,5 p.p. Um bootstrap reamostrando os 41 episódios inteiros dá 90% de probabilidade de o sinal ser positivo dentro de `Juros Down`, com intervalo de confiança que ainda cruza o zero. Variando a janela entre 42 e 126 pregões e as confirmações entre 1 e 3, o spread dentro de `Juros Down` vai de −11,1 a +20,8 p.p.

**Não há poder preditivo em horizonte de carteira.** O spread de earnings some e troca de sinal em 1, 3, 6 e 12 meses. O efeito vive na atribuição de um dia, que com um estado tão persistente é quase atribuição contemporânea. BPA esperado rotula o ambiente, não antecipa o retorno.

**Cuidado com a média do quadrante `Earnings Down / Juros Down`.** A média é positiva e a mediana por episódio é negativa. A diferença vem de dois episódios de recuperação pós-crash, iniciados em janeiro de 2009 e fevereiro de 2016, quando a bolsa já tinha virado e a expectativa de lucro ainda caía.

## Arquivos

```
workbook/regimes_earnings_juros_report.xlsx   12 abas, 9 gráficos nativos do Excel
workbook/ibovespa_earnings_macro_consolidado_com_scatter.xlsx  workbook consolidado com a aba Scatter Focus-Juros
setores/earnings_setoriais_auditados.xlsx     lucro setorial auditado, 11 abas, 2010 a 2026
setores/focus_earnings_vs_rate_performance/  scatter que cruza beta de earnings ao Focus e beta de performance ao DI
setores/build_earnings_workbook.mjs           gera o workbook setorial
metodologia.md                                especificação completa, decisões e alternativas descartadas
src/build_report.py                           gera o workbook
src/final_regime_core.cjs                     núcleo canônico da classificação (Node)
src/build_regime_summary_images.cjs           figuras estáticas e JSON-resumo
src/build_earnings_rates_chart.mjs            gráfico interativo de retorno acumulado
tests/repro_auditoria.py                      reprodução independente de todos os números
tests/testes_informacao.py                    rotação, controle por momentum, bootstrap, horizonte
data/cdi_2006_2013.json                       CDI diário do BCB SGS 12, 2006 a 2013
```

O workbook tem o painel diário como base e as tabelas-resumo em fórmula (`SUMIFS`, `COUNTIFS`, `INDEX`), então tudo recalcula se a base for estendida. A classificação de regime entra como valor, porque a máquina de estados de confirmação mensal não se escreve em fórmula de planilha.

## Lucro setorial

`setores/earnings_setoriais_auditados.xlsx` traz a base de lucro por setor usada na extensão setorial do estudo, de janeiro de 2010 a julho de 2026, 156 empresas e 17 setores da taxonomia XP.

O nível setorial é a soma do lucro estimado das empresas disponíveis no mês. A revisão de 3 meses usa **cesta constante**: compara apenas as companhias presentes nas duas pontas da janela, para que mudança de cobertura não seja confundida com revisão. As abas `Cobertura` e `Cobertura Revisao` mostram quantas empresas sustentam cada célula, o que importa porque vários setores têm de uma a três companhias.

O mapa empresa para setor foi auditado manualmente e a aba `Mapa Setorial` registra a classificação final ao lado da original, com o score de pareamento. A aba `Checks` traz as validações de dimensão e consistência.

| Aba | Conteúdo |
|---|---|
| `Nivel Setorial` | soma do lucro estimado, em R$ milhões |
| `Nivel Base 100` | mesma série indexada a 100 no primeiro ponto de cada setor |
| `Revisao 3M` | variação da soma em cesta constante |
| `Detalhe Revisao` | abertura longa, com as duas pontas e o número de empresas comuns |
| `Base Empresa` | série empresa a empresa, fonte auditável |
| `Cobertura`, `Cobertura Revisao` | número de empresas por setor e mês |
| `Mapa Setorial`, `Metodologia`, `Checks` | classificação, definições e validações |

## Fontes

| Série | Origem |
|---|---|
| BPA 12 meses à frente | Bloomberg, campo `BEst EPS` do Ibovespa |
| Ibovespa | BCB SGS série 7 até 30/12/2013, série B3 desde 02/01/2014 |
| Regimes e nível do swap Pré-DI 360d | [CaioLSouza/swap-pre-di-regimes](https://github.com/CaioLSouza/swap-pre-di-regimes) |
| IPCA | BCB SGS 433, jan/2006 a jul/2026 |
| CDI | BCB SGS 12, diário |
| USDBRL | PTAX diária do BCB |

### Sobre as séries de lucro

O workbook de regimes (`workbook/`) não traz a coluna do BPA do índice; a inclinação de 63 pregões, que é a estatística usada pela regra, está lá e todas as tabelas e gráficos funcionam sem a série bruta. Para regenerar o arquivo com a coluna, basta ter o `Ibovespa Best EPS.xlsx` e rodar `src/build_report.py`.

O workbook setorial (`setores/`) **traz** as estimativas de lucro do consenso, empresa a empresa, na aba `Base Empresa`. São 156 companhias e 199 meses, em R$ milhões, extraídas de grids da Bloomberg. Quem for reutilizar deve verificar a própria licença de dados antes.

### Não reproduzido

O report original traz tabelas de SMLL, IMA-B 5, IMA-B 5+, índices setoriais e cestas de fatores. Essas séries não estavam disponíveis, então as linhas correspondentes ficaram de fora. O limiar de swap que dispararia a virada de regime depende do modelo proprietário de juros e não foi replicado.

## Reproduzir

```bash
XP_ROOT=/caminho/para/os/dados PUBLIC_BUILD=1 python src/build_report.py
```

Dependências: `openpyxl` e `numpy`. Os testes rodam com `python tests/repro_auditoria.py` e `python tests/testes_informacao.py`.

## Aviso

Pesquisa pessoal. Não é publicação da XP Investimentos, não constitui recomendação de investimento e não representa a visão da instituição. Os resultados são uma decomposição histórica sujeita a todas as ressalvas registradas acima e em `metodologia.md`.
