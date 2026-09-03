# Regimes de earnings e juros para o Ibovespa

## Documento metodológico da implementação consolidada

**Status:** versão final consolidada nesta análise  
**Data de consolidação:** 2 de setembro de 2026  
**Última observação comum de EPS, juros e Ibovespa:** 12 de agosto de 2026  
**Último IPCA realizado usado no retorno real:** julho de 2026

Este documento registra a especificação final, as fontes, as decisões, os tratamentos, as fórmulas, os resultados, as limitações e o histórico das alternativas testadas. Quando houver diferença entre uma versão intermediária e a versão final, a versão final descrita nas seções 1 a 8 prevalece.

## 1. Objetivo

O objetivo é classificar cada dia da amostra em um regime de earnings e combinar essa classificação com o regime de juros da XP. Em seguida, o desempenho do Ibovespa é decomposto entre quatro quadrantes:

- `EU_JU`: Earnings Up / Juros Up;
- `EU_JD`: Earnings Up / Juros Down;
- `ED_JU`: Earnings Down / Juros Up;
- `ED_JD`: Earnings Down / Juros Down.

A análise é uma decomposição histórica de regimes. Ela não deve ser interpretada como prova causal, recomendação de investimento ou backtest de uma estratégia diretamente negociável.

## 2. Decisão final em uma frase

O regime de earnings é definido pelo sinal da inclinação OLS do log do BPA esperado de 12 meses à frente nos últimos 63 pregões, observado somente no fechamento de cada mês; uma mudança de regime exige dois fechamentos mensais consecutivos com sinal oposto e passa a valer no pregão seguinte à segunda confirmação.

Essa regra foi escolhida porque preserva a leitura econômica simples — expectativas de lucro subindo ou caindo — e reduz fortemente os falsos sinais da classificação diária sem introduzir bandas ou parâmetros calibrados sobre o retorno do Ibovespa.

## 3. O que ficou oficial

### 3.1 Earnings

- Série usada: BPA/EPS esperado para os próximos 12 meses do Ibovespa, em nível nominal.
- Transformação: log natural do BPA.
- Janela da tendência: 63 observações de mercado, aproximadamente três meses.
- Estimador: inclinação de uma regressão linear do log do BPA contra o tempo dentro da janela.
- Sinal bruto: inclinação maior que zero indica `Earnings Up`; inclinação menor ou igual a zero indica `Earnings Down`.
- Frequência de observação do sinal: apenas o último pregão disponível de cada mês.
- Filtro contra ruído: dois fechamentos mensais consecutivos do lado oposto de zero para mudar o estado.
- Defasagem operacional: a mudança confirmada entra no pregão seguinte.
- Enquanto a mudança não é confirmada, mantém-se o regime anterior.
- Sem média móvel adicional sobre o BPA.
- Sem winsorização na especificação final.
- Sem banda de histerese em torno de zero.
- Sem período mínimo de permanência além da confirmação mensal.
- Sem ajuste do BPA pelo Focus IPCA na especificação final.

### 3.2 Juros

- A classificação de juros usa as janelas de `Hike` e `Cut` da série de regimes do swap Pré-DI e é alinhada às datas publicadas pela XP.
- No vocabulário deste trabalho, `Hike` equivale a `Juros Up` e `Cut` equivale a `Juros Down`.
- Para manter consistência com os relatórios mais recentes fornecidos, a amostra é forçada para `Juros Down` desde 7 de maio de 2025 até 12 de agosto de 2026.
- A virada mecânica existente no arquivo diário em 16 de abril de 2026 não é incorporada. O relatório da XP ainda tratava o regime como `Rates Down` e indicava uma possível virada apenas mais adiante em 2026.
- Como o Ibovespa disponível termina em 12 de agosto de 2026, nenhuma eventual virada posterior entra na amostra.

### 3.3 Retornos e frequências

- O retorno do fechamento de `t` ao fechamento de `t+1` é atribuído ao regime vigente em `t`.
- Retornos são compostos em log para evitar erro de soma de retornos simples.
- A anualização usa 252 pregões.
- Frequências dos regimes são calculadas por dias corridos entre datas efetivas de mudança.
- O retorno real é calculado com IPCA realizado mensal; o log da inflação do mês é distribuído igualmente entre os intervalos de pregão daquele mês.
- Como o último IPCA realizado disponível é julho de 2026, as estatísticas de retorno real terminam em julho de 2026, embora a frequência e o estado corrente sejam atualizados até 12 de agosto de 2026.

## 4. Fontes e linhagem dos dados

| Componente | Arquivo/fonte | Cobertura relevante | Uso final |
|---|---|---:|---|
| BPA 12 meses à frente | `Ibovespa Best EPS.xlsx`, planilha `Sheet1` | 02-jan-2006 a 24-ago-2026; 5.386 observações | Define o regime de earnings |
| Ibovespa até 2013 | BCB SGS série 7 | 02-jan-2002 a 30-dez-2013 | Retorno e nível do índice |
| Ibovespa desde 2014 | arquivo B3 já existente no projeto | 02-jan-2014 a 12-ago-2026 | Retorno e nível do índice |
| Ibovespa consolidado | `tmp/earnings_regimes_analysis/ibov_daily_long.csv` | 02-jan-2002 a 12-ago-2026; 6.115 observações | Painel diário final |
| Regime de juros | `swap_pre_di_regimes.csv` | série diária | Classificação Juros Up/Down |
| IPCA realizado | arquivos JSON do BCB em `tmp/earnings_regimes_analysis/ipca` | jan-2006 a jul-2026 | Deflação dos retornos |
| Focus IPCA 12 meses | `serie_historica_focus_ipca_12m.xlsx`, planilha `Focus_12m_Base0` | 12-dez-2001 a 21-ago-2026 | Apenas teste alternativo; não entra na regra final |

O alinhamento é feito por data de mercado. Para cada observação do Ibovespa, usa-se a observação de BPA mais recente com data menor ou igual à data do índice. No painel auditado, a interseção final contém 5.106 linhas entre 2 de janeiro de 2006 e 12 de agosto de 2026. Depois da janela inicial e da defasagem do primeiro sinal mensal, há 5.036 dias classificados, de 3 de abril de 2006 a 12 de agosto de 2026.

### 4.1 Controles de qualidade executados

- 5.386 registros de BPA; nenhuma data duplicada.
- 6.115 registros consolidados do Ibovespa; nenhuma data duplicada.
- 5.106 datas alinhadas entre BPA e Ibovespa.
- A junção das duas fontes do Ibovespa ocorre em 2 de janeiro de 2014; o retorno observado nessa data é de -2,26%.
- A mediana da variação diária absoluta do BPA é 0,14%; o percentil 95 é 1,02% e o percentil 99 é 2,07%.
- Foram identificadas revisões muito grandes do BPA em 2013, inclusive +75,2% em 1º de novembro de 2013 e -50,0% em 2 de setembro de 2013. Por isso, a winsorização foi testada separadamente, mas não foi adotada.
- A série de BPA não contém dias sem alteração dentro da base fornecida.

## 5. Algoritmo exato do regime de earnings

Para cada pregão `t`, com pelo menos 63 observações disponíveis, define-se:

`y(t-j) = ln(EPS12mFwd(t-j))`, para `j = 0, ..., 62`.

A inclinação é:

`beta(t) = Σ[(i - média(i)) × (y(i) - média(y))] / Σ[(i - média(i))²]`, com `i = 0, ..., 62`.

O sinal mensal candidato no último pregão `m` de cada mês é:

- `Up`, se `beta(m) > 0`;
- `Down`, se `beta(m) <= 0`.

A máquina de estados funciona assim:

1. O primeiro sinal mensal válido inicializa o regime.
2. Se o sinal mensal é igual ao regime vigente, qualquer contagem pendente é zerada.
3. Se o sinal mensal é oposto ao regime vigente, inicia-se ou continua-se a contagem de confirmações.
4. Se dois fechamentos mensais consecutivos apontam para o novo lado, o regime muda.
5. A mudança vale no primeiro pregão depois do segundo fechamento mensal.

O primeiro sinal válido foi observado em 31 de março de 2006 e passou a valer em 3 de abril de 2006. A mudança mais recente foi confirmada no fechamento de 28 de novembro de 2025 e passou a valer em 1º de dezembro de 2025.

## 6. Construção dos retornos

### 6.1 Retorno nominal

Para cada intervalo diário:

`r_nom(t) = ln(IBOV(t+1) / IBOV(t))`.

Para um regime `g`, com `N(g)` intervalos:

`R_nom_anual(g) = exp[252 / N(g) × Σ r_nom(t | g)] - 1`.

### 6.2 Retorno real

Para um mês `m`, com inflação mensal `IPCA(m)` e `K(m)` intervalos de pregão:

`pi_diaria(m) = ln(1 + IPCA(m)) / K(m)`.

Então:

`r_real(t) = r_nom(t) - pi_diaria(mês(t))`.

E:

`R_real_anual(g) = exp[252 / N(g) × Σ r_real(t | g)] - 1`.

### 6.3 Curvas acumuladas

No gráfico de desempenho acumulado por regime, cada curva acumula somente os retornos dos dias pertencentes ao seu quadrante e fica horizontal nos demais dias:

`C_g(T) = exp[Σ até T de r_nom(t) × 1(regime(t)=g)] - 1`.

Esse gráfico não representa uma carteira investida continuamente em um único ativo. Ele mostra a contribuição histórica do Ibovespa nos intervalos classificados em cada regime.

## 7. Resultado oficial da regra final

### 7.1 Frequência, eventos e retornos

| Regime | Dias corridos | Frequência | Episódios | Intervalos no retorno real | Retorno nominal anualizado | Retorno real anualizado | Dias nominais positivos |
|---|---:|---:|---:|---:|---:|---:|---:|
| Earnings Up / Juros Down | 1.916 | 25,8% | 12 | 1.282 | 31,7% | **26,8%** | 55,1% |
| Earnings Down / Juros Down | 1.912 | 25,7% | 9 | 1.303 | 13,2% | **8,4%** | 49,7% |
| Earnings Up / Juros Up | 2.474 | 33,3% | 11 | 1.681 | -2,3% | **-8,3%** | 52,1% |
| Earnings Down / Juros Up | 1.134 | 15,3% | 9 | 762 | -11,3% | **-18,3%** | 49,3% |

As frequências usam 7.436 dias corridos entre 3 de abril de 2006 e 12 de agosto de 2026. Diferenças de uma casa decimal decorrem de arredondamento.

### 7.2 Frequências marginais

| Classificação | Dias corridos | Frequência |
|---|---:|---:|
| Earnings Up | 4.390 | 59,0% |
| Earnings Down | 3.046 | 41,0% |
| Juros Down | 3.828 | 51,5% |
| Juros Up | 3.608 | 48,5% |

### 7.3 Estado corrente

Na última observação comum, 12 de agosto de 2026:

- earnings: `Earnings Up`, vigente desde 1º de dezembro de 2025;
- juros: `Juros Down`, vigente desde 7 de maio de 2025;
- quadrante combinado: `Earnings Up / Juros Down`, vigente desde 1º de dezembro de 2025.

### 7.4 Leitura econômica

O regime de juros é o principal separador dos retornos: os dois quadrantes de Juros Down tiveram retorno real positivo e os dois quadrantes de Juros Up tiveram retorno real negativo. Dentro de cada regime de juros, Earnings Up melhora o resultado:

- sob Juros Down, 26,8% reais em Earnings Up contra 8,4% em Earnings Down, diferença de 18,4 p.p.;
- sob Juros Up, -8,3% reais em Earnings Up contra -18,3% em Earnings Down, diferença de 10,0 p.p.

Portanto, a leitura consolidada não é que earnings substitui juros como explicação do mercado. Earnings funciona melhor como uma segunda dimensão que qualifica o ambiente de juros.

## 8. Controle de excesso de regimes

O problema da regra diária original era o excesso de alternâncias perto de inclinação zero.

| Métrica | Sinal diário sem filtro | Regra final mensal com 2 confirmações |
|---|---:|---:|
| Episódios de earnings | 55 | 29 |
| Episódios combinados earnings/juros | 66 | 41 |
| Episódios combinados com até 30 dias | 17 | 3 |
| Duração mediana de um episódio combinado | 71 dias | 142 dias |
| Participação de Earnings Up | 60,5% em pregões / 60,7% em dias corridos | 59,0% em dias corridos |
| Início do Earnings Up corrente | 3-out-2025 | 1-dez-2025 |

A regra final reduz em 47% o número total de episódios de earnings e em 82% o número de regimes combinados curtos de até 30 dias; também dobra a duração mediana dos episódios. O custo é uma defasagem intencional: a classificação reage mais devagar, mas é mais estável e mais próxima da frequência econômica das revisões de lucro.

## 9. Robustez estatística e limites de interpretação

### 9.1 O que os testes sustentam

- A ordenação econômica da regra final é coerente: Earnings Up supera Earnings Down tanto em Juros Up quanto em Juros Down.
- A confirmação mensal reduz ruído sem precisar escolher uma banda de magnitude específica.
- O balanceamento 59%/41% é aceitável e próximo do observado nas versões diárias.
- A conclusão mais robusta da decomposição combinada é a importância do regime de juros.

### 9.2 O que os testes não sustentam

- Não há evidência estatística forte de que o BPA, sozinho, seja uma proxy robusta de retornos futuros do Ibovespa.
- Na regra final, um teste de Welch aproximado sobre retornos log diários dá `p ≈ 0,38` para a diferença Earnings Up versus Down dentro de Juros Down e `p ≈ 0,59` dentro de Juros Up. Esses valores não rejeitam igualdade de médias em níveis usuais.
- Os erros diários não são independentes e os regimes persistem, então esses p-valores são apenas diagnósticos. Eles não devem ser lidos como validação definitiva.
- Há apenas 41 episódios combinados, com 9 a 12 episódios por quadrante. O tamanho efetivo da amostra é muito menor que o número de dias.
- O resultado é sensível a crises, à composição setorial do Ibovespa e a revisões extremas do BPA.

### 9.3 Auditoria ampla de especificações

Foram testadas 2.528 variantes de regras de earnings; 2.214 atenderam aos critérios mínimos de elegibilidade. Entre as elegíveis:

- 37,4% tiveram spread de retorno positivo no agregado;
- apenas 4,3% tiveram spread positivo simultaneamente no agregado, no período inicial e no período recente;
- o spread mediano agregado foi -3,7 p.p.;
- o spread mediano no período inicial foi -17,2 p.p.;
- o spread mediano no período recente foi +4,2 p.p.

Essa instabilidade entre subamostras é o principal motivo para não vender o sinal de earnings como preditor autônomo. O uso oficial é descritivo e condicional ao regime de juros.

## 10. Alternativas testadas e por que não foram adotadas

### 10.1 Variação diária do BPA sem filtro

A primeira formulação classificava o regime pela direção diária do BPA ou pela inclinação diária sem confirmação. Ela era fiel à ideia de “earnings subindo ou caindo”, mas produzia alternâncias excessivas, inclusive regimes de poucos dias. Foi substituída pelo filtro mensal.

### 10.2 BPA real usando Focus IPCA 12 meses

Foi testada a série:

`EPS_real_ex_ante(t) = EPS_12m_fwd(t) / [1 + Focus_IPCA_12m(t)]`.

Na especificação intermediária mais lenta, a participação de Earnings Up ficou em 61,27%, praticamente igual aos 61,32% da série nominal. O spread anualizado Up menos Down passou de -0,7 p.p. na nominal para +2,1 p.p. com Focus, mas sem significância econômica ou estatística robusta. Na regra rápida de três meses, o Focus produziu participação Up de 59,4% e spread de 9,6 p.p., contra 60,5% e 8,7 p.p. na série nominal.

O ajuste trouxe pouca melhora no balanceamento, não resolveu a instabilidade histórica e mistura revisão de lucro com revisão de inflação esperada. Por simplicidade, transparência e menor risco de erro de alinhamento, a versão final usa o BPA nominal.

### 10.3 Winsorização

As revisões log diárias foram winsorizadas a 1% em cada cauda. Na série nominal, os limites estimados foram aproximadamente -1,72% e +1,64%. Na regra rápida de três meses, o spread anualizado caiu de 8,7 p.p. sem winsorização para 3,9 p.p. com winsorização. A winsorização reduziu a influência de extremos, mas não tornou o resultado mais robusto entre subperíodos.

Como os saltos podem representar revisões econômicas reais do consenso, e não apenas erro, a versão final preserva os dados originais e registra os outliers na auditoria.

### 10.4 Regra análoga à inflação do relatório XP

Foi testada a lógica de comparar o crescimento do BPA com sua própria média histórica. O análogo mais direto usou crescimento em 12 meses contra média de 36 meses:

- nominal, sem suavização: 44,2% em Up, 23 eventos, retorno anualizado de 5,2% em Up e 7,4% em Down; spread de -2,2 p.p.;
- nominal, com suavização/confirmação de cinco dias: 43,9% em Up, 13 eventos; spread de +1,2 p.p., mas -9,3 p.p. no período inicial e +1,5 p.p. no recente;
- ajustado pelo Focus, sem suavização: 43,5% em Up, 29 eventos; spread de +2,3 p.p.;
- ajustado pelo Focus, suavizado: 43,3% em Up, 15 eventos; spread de -0,3 p.p.

A regra ficou mais equilibrada em frequência, porém não produziu uma separação estável de retornos. Não foi adotada.

### 10.5 Regra 6 meses versus média de 36 meses

Essa combinação também foi testada formalmente:

- nominal: 43,6% em Up, 51 episódios; diferença aritmética anualizada de cerca de +6,7 p.p.; `p ≈ 0,55` no teste diário e `p ≈ 0,92` no período de teste desde 2016;
- ajustada pelo Focus: 42,7% em Up, 49 episódios; diferença de cerca de +8,5 p.p.; `p ≈ 0,44` no teste diário e `p ≈ 0,73` desde 2016.

Apesar do sinal positivo no agregado, a combinação não é estatisticamente significativa nem estável o suficiente para ser a regra oficial.

### 10.6 Médias móveis, endpoints, OLS e regra MSCI de quatro trimestres

A grade ampla incluiu:

- variação entre ponto inicial e final da janela;
- inclinação OLS;
- cruzamento de médias móveis;
- regra ponderada de quatro revisões trimestrais inspirada em medidas de earnings revisions;
- janelas de 1, 2, 3, 6 e 12 meses;
- suavizações de 1, 5, 10, 20 e 40 pregões;
- bandas de 0, 0,25%, 0,50% e 1,00%;
- confirmações de 1, 5, 10 e 20 pregões;
- série nominal e série ajustada pelo Focus.

Nenhuma família apresentou robustez suficiente para justificar uma regra complexa escolhida apenas por melhor backtest. A versão final privilegia parcimônia.

### 10.7 Confirmação diária, banda de histerese e permanência mínima

Foram testadas confirmações de 1 a 30 pregões, bandas de até 3%, suavização e períodos mínimos de 21, 42 ou 63 pregões.

- Dez pregões de confirmação sem banda ainda produziram 49 episódios de earnings, 60 episódios combinados e 12 episódios combinados de até 30 dias.
- Uma banda de 3% com 15 pregões de confirmação produziu 23 episódios de earnings, 35 combinados, apenas 2 curtos e duração mediana de 164 dias.
- Apesar da boa estabilidade, a banda de 3% e os 15 dias são parâmetros mais arbitrários e mais expostos a data mining.
- Três fechamentos mensais consecutivos reduziram a série para 19 episódios de earnings e 31 combinados, mas introduziram atraso excessivo e enfraqueceram a diferenciação de retorno.

Dois fechamentos mensais foram o compromisso final entre estabilidade, simplicidade e tempo de reação.

## 11. Diferenças em relação ao relatório XP

O trabalho replica a arquitetura do relatório, não a variável econômica original:

- como no relatório, cada data recebe uma classificação discreta de regime;
- janelas contínuas são formadas a partir das mudanças de sinal;
- o retorno do Ibovespa é acumulado apenas dentro das janelas correspondentes;
- os quadrantes são comparados por frequência e retorno anualizado real.

A diferença é a regra de estado. A inflação do relatório é comparada com uma referência histórica e o regime de juros usa a inclinação do swap Pré-DI de 360 dias. Para earnings, a tentativa de copiar literalmente a comparação com média móvel não funcionou bem. Por isso, a versão final usa a inclinação trimestral do BPA com confirmação mensal.

Os documentos de referência são:

- [Keeping Up with Inflation](https://researchxp1.s3.sa-east-1.amazonaws.com/202504+Keeping+Up+with+Inflation.pdf);
- [Regime change ahead](https://researchxp1.s3.sa-east-1.amazonaws.com/Regime+change+ahead.pdf);
- [Insights from Our Regime Monitor — 14/11/2025](https://researchxp1.s3.sa-east-1.amazonaws.com/Insights+from+Our+Regime+Monitor+-+20251114.pdf).

## 12. Limitações operacionais e de dados

- A série de BPA deve ser entendida como expectativa de 12 meses à frente, não lucro realizado.
- A análise assume que cada observação histórica do BPA representa o consenso disponível naquela data. A base não foi validada contra um banco point-in-time externo.
- Mudanças na composição do Ibovespa podem alterar o BPA agregado e não são neutralizadas.
- O BPA nominal incorpora inflação e câmbio indiretamente; o ajuste pelo Focus foi apenas uma aproximação e foi descartado.
- O splice BCB/B3 em janeiro de 2014 foi verificado, mas continua sendo uma mudança de fonte.
- Os regimes de juros são alinhados aos relatórios e não constituem aqui uma reconstrução independente completa do modelo proprietário da XP.
- Não são considerados custos de transação, impostos, liquidez ou possibilidade de negociação de um índice de EPS.
- O resultado real usa inflação realizada, portanto é adequado para avaliação ex post, não para decisão em tempo real.
- Comparações de retorno anualizado podem ser influenciadas por poucos episódios de crise.
- A escolha da regra final ocorreu após vários testes. Mesmo preferindo uma regra simples, permanece risco de seleção de especificação.

## 13. Reprodutibilidade e arquivos oficiais

### 13.1 Código fonte da regra final

- `tmp/earnings_regimes_analysis/final_regime_core.cjs`: fonte canônica da classificação e dos cálculos.
- `tmp/earnings_regimes_analysis/build_regime_summary_images.cjs`: gera as três figuras estáticas e o JSON-resumo.
- `tmp/earnings_regimes_analysis/build_earnings_rates_chart.mjs`: gera o gráfico interativo de retorno acumulado por regime.

### 13.2 Saídas oficiais

- `earnings_rates_regime_summary.json`: parâmetros, frequências, retornos e todas as janelas.
- `earnings_rates_regime_frequency.png`: frequência relativa e tabela de episódios combinados.
- `ibovespa_across_earnings_rates_regimes.png`: nível do Ibovespa colorido pelo quadrante vigente.
- `ibovespa_annualized_real_returns_earnings_rates.png`: retorno real anualizado por quadrante.
- `earnings-rates-regimes.html`: curvas acumuladas do Ibovespa nos quatro regimes.

### 13.3 Hashes SHA-256 dos principais insumos e do núcleo final

| Arquivo | SHA-256 |
|---|---|
| `Ibovespa Best EPS.xlsx` | `53432DF8A526930E1D3B71AA6C35AF4392DAD47BA9A50E6AAC6902AA3ADB864C` |
| `ibov_daily_long.csv` | `850ADAE3FAFF3CB888902C2AF441E80FFCA56C594AB52BC208C6AFBA89930D59` |
| `swap_pre_di_regimes.csv` | `68B7CF3F91CD372AACE831C5B2F34322CF7A914EC55A5ABFEC72DF9E182A0CDB` |
| `ipca_2006_2015.json` | `D6260D398C8ED5F686C9329C48288775E9FB44C496C5032D93C232E33F0304C4` |
| `ipca_2016_2025.json` | `42F4DB0C40B66C2FBC3E26200AF82B9429C893FF9F2AEA70CCB41CC9B03C1AD5` |
| `ipca_2026.json` | `F56DFCA0DB25C9FAEB9154767082E20CCB2D2051C2CC68C254A5A65EE9BCA087` |
| `final_regime_core.cjs` | `4D58986A720E112172BCE9E973EC93050BF3B32FA9610C4CBB597D86239A089D` |

## Apêndice A — Janelas finais de earnings

| Regime | Início efetivo | Fim | Dias corridos | Pregões classificados |
|---|---:|---:|---:|---:|
| Up | 03-abr-2006 | 01-jun-2006 | 59 | 40 |
| Down | 01-jun-2006 | 01-nov-2006 | 153 | 106 |
| Up | 01-nov-2006 | 02-jan-2008 | 427 | 283 |
| Down | 02-jan-2008 | 03-mar-2008 | 61 | 39 |
| Up | 03-mar-2008 | 02-jan-2009 | 305 | 209 |
| Down | 02-jan-2009 | 01-set-2009 | 242 | 165 |
| Up | 01-set-2009 | 01-dez-2010 | 456 | 305 |
| Down | 01-dez-2010 | 01-fev-2011 | 62 | 41 |
| Up | 01-fev-2011 | 01-ago-2011 | 181 | 124 |
| Down | 01-ago-2011 | 02-jan-2014 | 885 | 599 |
| Up | 02-jan-2014 | 01-ago-2014 | 211 | 143 |
| Down | 01-ago-2014 | 03-ago-2015 | 367 | 248 |
| Up | 03-ago-2015 | 01-dez-2015 | 120 | 82 |
| Down | 01-dez-2015 | 01-jul-2016 | 213 | 142 |
| Up | 01-jul-2016 | 02-out-2017 | 458 | 313 |
| Down | 02-out-2017 | 01-dez-2017 | 60 | 40 |
| Up | 01-dez-2017 | 01-ago-2019 | 608 | 407 |
| Down | 01-ago-2019 | 01-out-2020 | 427 | 292 |
| Up | 01-out-2020 | 03-jan-2022 | 459 | 308 |
| Down | 03-jan-2022 | 01-abr-2022 | 88 | 62 |
| Up | 01-abr-2022 | 01-dez-2022 | 244 | 167 |
| Down | 01-dez-2022 | 02-mai-2023 | 152 | 100 |
| Up | 02-mai-2023 | 03-jul-2023 | 62 | 43 |
| Down | 03-jul-2023 | 01-nov-2023 | 121 | 85 |
| Up | 01-nov-2023 | 01-nov-2024 | 366 | 252 |
| Down | 01-nov-2024 | 02-jan-2025 | 62 | 38 |
| Up | 02-jan-2025 | 01-jul-2025 | 180 | 122 |
| Down | 01-jul-2025 | 01-dez-2025 | 153 | 108 |
| Up | 01-dez-2025 | Atual em 12-ago-2026 | 254 | 173 |

## Apêndice B — Janelas finais de juros usadas

| Regime | Início | Fim | Dias corridos | Pregões classificados |
|---|---:|---:|---:|---:|
| Down | 03-abr-2006 | 06-set-2007 | 521 | 354 |
| Up | 06-set-2007 | 10-dez-2008 | 461 | 310 |
| Down | 10-dez-2008 | 05-out-2009 | 299 | 201 |
| Up | 05-out-2009 | 17-ago-2011 | 681 | 459 |
| Down | 17-ago-2011 | 25-fev-2013 | 558 | 374 |
| Up | 25-fev-2013 | 10-fev-2016 | 1.080 | 730 |
| Down | 10-fev-2016 | 08-jun-2018 | 849 | 577 |
| Up | 08-jun-2018 | 26-out-2018 | 140 | 97 |
| Down | 26-out-2018 | 05-out-2020 | 710 | 478 |
| Up | 05-out-2020 | 07-mar-2023 | 883 | 600 |
| Down | 07-mar-2023 | 09-mai-2024 | 429 | 290 |
| Up | 09-mai-2024 | 07-mai-2025 | 363 | 247 |
| Down | 07-mai-2025 | Atual em 12-ago-2026 | 462 | 319 |

## Apêndice C — Todas as janelas combinadas finais

| Regime | Início | Fim | Dias corridos | Pregões classificados |
|---|---:|---:|---:|---:|
| EU_JD | 03-abr-2006 | 01-jun-2006 | 59 | 40 |
| ED_JD | 01-jun-2006 | 01-nov-2006 | 153 | 106 |
| EU_JD | 01-nov-2006 | 06-set-2007 | 309 | 208 |
| EU_JU | 06-set-2007 | 02-jan-2008 | 118 | 75 |
| ED_JU | 02-jan-2008 | 03-mar-2008 | 61 | 39 |
| EU_JU | 03-mar-2008 | 10-dez-2008 | 282 | 196 |
| EU_JD | 10-dez-2008 | 02-jan-2009 | 23 | 13 |
| ED_JD | 02-jan-2009 | 01-set-2009 | 242 | 165 |
| EU_JD | 01-set-2009 | 05-out-2009 | 34 | 23 |
| EU_JU | 05-out-2009 | 01-dez-2010 | 422 | 282 |
| ED_JU | 01-dez-2010 | 01-fev-2011 | 62 | 41 |
| EU_JU | 01-fev-2011 | 01-ago-2011 | 181 | 124 |
| ED_JU | 01-ago-2011 | 17-ago-2011 | 16 | 12 |
| ED_JD | 17-ago-2011 | 25-fev-2013 | 558 | 374 |
| ED_JU | 25-fev-2013 | 02-jan-2014 | 311 | 213 |
| EU_JU | 02-jan-2014 | 01-ago-2014 | 211 | 143 |
| ED_JU | 01-ago-2014 | 03-ago-2015 | 367 | 248 |
| EU_JU | 03-ago-2015 | 01-dez-2015 | 120 | 82 |
| ED_JU | 01-dez-2015 | 10-fev-2016 | 71 | 44 |
| ED_JD | 10-fev-2016 | 01-jul-2016 | 142 | 98 |
| EU_JD | 01-jul-2016 | 02-out-2017 | 458 | 313 |
| ED_JD | 02-out-2017 | 01-dez-2017 | 60 | 40 |
| EU_JD | 01-dez-2017 | 08-jun-2018 | 189 | 126 |
| EU_JU | 08-jun-2018 | 26-out-2018 | 140 | 97 |
| EU_JD | 26-out-2018 | 01-ago-2019 | 279 | 184 |
| ED_JD | 01-ago-2019 | 01-out-2020 | 427 | 292 |
| EU_JD | 01-out-2020 | 05-out-2020 | 4 | 2 |
| EU_JU | 05-out-2020 | 03-jan-2022 | 455 | 306 |
| ED_JU | 03-jan-2022 | 01-abr-2022 | 88 | 62 |
| EU_JU | 01-abr-2022 | 01-dez-2022 | 244 | 167 |
| ED_JU | 01-dez-2022 | 07-mar-2023 | 96 | 65 |
| ED_JD | 07-mar-2023 | 02-mai-2023 | 56 | 35 |
| EU_JD | 02-mai-2023 | 03-jul-2023 | 62 | 43 |
| ED_JD | 03-jul-2023 | 01-nov-2023 | 121 | 85 |
| EU_JD | 01-nov-2023 | 09-mai-2024 | 190 | 127 |
| EU_JU | 09-mai-2024 | 01-nov-2024 | 176 | 125 |
| ED_JU | 01-nov-2024 | 02-jan-2025 | 62 | 38 |
| EU_JU | 02-jan-2025 | 07-mai-2025 | 125 | 84 |
| EU_JD | 07-mai-2025 | 01-jul-2025 | 55 | 38 |
| ED_JD | 01-jul-2025 | 01-dez-2025 | 153 | 108 |
| EU_JD | 01-dez-2025 | Atual em 12-ago-2026 | 254 | 173 |

## Apêndice D — Convenções de contagem

- A data de início é inclusiva.
- Para um episódio encerrado, a data de fim é a primeira data do episódio seguinte e a duração em dias corridos é a diferença entre as duas datas.
- Para o episódio corrente, a data de fim é a última observação da amostra.
- A soma dos dias corridos por quadrante é usada para frequência relativa.
- A contagem de pregões classificados inclui as observações diárias pertencentes ao episódio.
- A estatística de retorno usa intervalos `t → t+1`; por isso, o número de retornos pode ser menor que a contagem de observações.
- O arredondamento exibido nos gráficos é de uma casa decimal, mas os cálculos usam precisão integral de ponto flutuante.

## Apêndice E — Regra de governança para atualizações futuras

Para preservar comparabilidade, uma atualização ordinária deve apenas acrescentar novas observações de BPA, Ibovespa, IPCA e juros. Os parâmetros `63 pregões`, `fechamento mensal`, `duas confirmações`, `limiar zero` e `defasagem de um pregão` não devem ser recalibrados em função do retorno observado.

Uma alteração desses parâmetros deve ser tratada como nova versão metodológica, acompanhada de:

1. justificativa econômica ex ante;
2. comparação com a versão vigente;
3. resultados em subamostras;
4. contagem de episódios e sensibilidade;
5. nova data de versão e novos hashes dos insumos.
