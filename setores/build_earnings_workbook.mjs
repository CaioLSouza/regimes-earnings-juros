import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = process.env.OUTPUT_DIR ?? path.dirname(new URL(import.meta.url).pathname.slice(1));
const sourceDir = path.join(outputDir, "series_source");
const outputPath = path.join(outputDir, "earnings_setoriais_auditados.xlsx");
const previewDir = path.join(outputDir, "previews");
const payload = JSON.parse(await fs.readFile(path.join(sourceDir, "workbook_data.json"), "utf8"));

await fs.mkdir(previewDir, { recursive: true });

const colors = {
  ink: "#18212B",
  slate: "#566574",
  copper: "#B85C2B",
  copperLight: "#F3E2D7",
  soft: "#F4F6F8",
  white: "#FFFFFF",
  grid: "#D7DEE5",
  green: "#1F7A55",
  greenLight: "#E1F1E8",
  red: "#A33B36",
  redLight: "#F7E2E0",
  formula: "#008000",
};

const workbook = Workbook.create();
const sheets = {
  resumo: workbook.worksheets.add("Resumo"),
  nivel: workbook.worksheets.add("Nivel Setorial"),
  nivelBase100: workbook.worksheets.add("Nivel Base 100"),
  revisao: workbook.worksheets.add("Revisao 3M"),
  cobertura: workbook.worksheets.add("Cobertura"),
  coberturaRevisao: workbook.worksheets.add("Cobertura Revisao"),
  detalhe: workbook.worksheets.add("Detalhe Revisao"),
  base: workbook.worksheets.add("Base Empresa"),
  mapa: workbook.worksheets.add("Mapa Setorial"),
  metodologia: workbook.worksheets.add("Metodologia"),
  checks: workbook.worksheets.add("Checks"),
};

function colLetter(number) {
  let n = number;
  let result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function parseMonth(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)) : value;
}

function formatTitle(sheet, title, subtitle, lastColumn) {
  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastColumn}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: colors.ink,
    font: { bold: true, color: colors.white, size: 16 },
    verticalAlignment: "center",
  };
  sheet.getRange("A1").format.rowHeight = 27;
  sheet.getRange(`A2:${lastColumn}2`).merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange(`A2:${lastColumn}2`).format = {
    fill: colors.soft,
    font: { color: colors.slate, italic: true, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange("A2").format.rowHeight = 30;
}

function prettyHeaders(columns) {
  const names = {
    mes: "Mês",
    empresa: "Empresa Bloomberg",
    valor: "Earnings",
    sector_xp: "Setor XP",
    macro_sector_xp: "Macro setor XP",
    super_sector_xp: "Super setor XP",
    arquivo: "Arquivo de origem",
    earnings_tmenos3_cesta_constante: "Earnings t-3 (cesta constante)",
    earnings_t_cesta_constante: "Earnings t (cesta constante)",
    revisao_3m_nivel: "Revisão 3M",
    empresas_comuns: "Empresas comuns",
    bbg: "Empresa Bloomberg",
    xp: "Empresa XP",
    score: "Score",
    origem: "Origem do pareamento",
    sector_xp_original: "Setor XP original",
    macro_sector_xp_original: "Macro setor XP original",
    super_sector_xp_original: "Super setor XP original",
  };
  return columns.map((column) => names[column] ?? column);
}

function addDataSheet({
  sheet,
  title,
  subtitle,
  tableData,
  tableName,
  dateColumn = false,
  numberColumns = [],
  integerColumns = [],
  columnWidths = {},
}) {
  const columns = tableData.columns;
  const lastColumn = colLetter(columns.length);
  const rows = tableData.data.map((row) =>
    row.map((value, index) => (dateColumn && index === 0 ? parseMonth(value) : value)),
  );
  const headerRow = 4;
  const dataStartRow = 5;
  const lastRow = headerRow + rows.length;

  formatTitle(sheet, title, subtitle, lastColumn);
  sheet.getRange(`A${headerRow}:${lastColumn}${headerRow}`).values = [prettyHeaders(columns)];
  sheet.getRange(`A${headerRow}:${lastColumn}${headerRow}`).format = {
    fill: colors.copper,
    font: { bold: true, color: colors.white, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange(`A${headerRow}`).format.rowHeight = 31;
  if (rows.length) {
    sheet.getRange(`A${dataStartRow}:${lastColumn}${lastRow}`).values = rows;
    sheet.getRange(`A${dataStartRow}:${lastColumn}${lastRow}`).format = {
      font: { color: colors.ink, size: 9 },
      verticalAlignment: "center",
    };
  }

  const table = sheet.tables.add(`A${headerRow}:${lastColumn}${lastRow}`, true, tableName);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  table.showBandedColumns = false;

  if (dateColumn && rows.length) {
    sheet.getRange(`A${dataStartRow}:A${lastRow}`).format.numberFormat = "mmm yyyy";
    sheet.getRange(`A${dataStartRow}:A${lastRow}`).format.horizontalAlignment = "center";
  }
  for (const columnNumber of numberColumns) {
    const column = colLetter(columnNumber);
    sheet.getRange(`${column}${dataStartRow}:${column}${lastRow}`).format.numberFormat = "#,##0.0;[Red](#,##0.0);-";
  }
  for (const columnNumber of integerColumns) {
    const column = colLetter(columnNumber);
    sheet.getRange(`${column}${dataStartRow}:${column}${lastRow}`).format.numberFormat = "#,##0";
  }
  for (let index = 1; index <= columns.length; index += 1) {
    const column = colLetter(index);
    sheet.getRange(`${column}:${column}`).format.columnWidth = columnWidths[index] ?? (index === 1 ? 13 : 18);
  }
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(1);
  return { headerRow, dataStartRow, lastRow, columns };
}

const levelInfo = addDataSheet({
  sheet: sheets.nivel,
  title: "Earnings setoriais — nível",
  subtitle: "Soma dos earnings de todas as empresas disponíveis em cada mês. Valores assinados; perdas são mantidas.",
  tableData: payload.nivel,
  tableName: "tblNivelSetorial",
  dateColumn: true,
  numberColumns: Array.from({ length: 17 }, (_, index) => index + 2),
});

// Índice derivado: cada setor vale 100 em sua primeira observação válida.
const base100HeaderRow = 4;
const base100DataStartRow = 5;
const base100LastRow = base100HeaderRow + payload.nivel.data.length;
formatTitle(
  sheets.nivelBase100,
  "Earnings setoriais — índice base 100",
  "Cada setor vale 100 na primeira observação válida da própria série. A evolução usa o nível setorial e pode refletir mudanças de cobertura.",
  "R",
);
sheets.nivelBase100.getRange("A4:R4").values = [prettyHeaders(payload.nivel.columns)];
sheets.nivelBase100.getRange("A4:R4").format = {
  fill: colors.copper,
  font: { bold: true, color: colors.white, size: 10 },
  wrapText: true,
  verticalAlignment: "center",
};
sheets.nivelBase100.getRange("A4").format.rowHeight = 31;
const firstValidRows = [];
for (let columnIndex = 1; columnIndex < payload.nivel.columns.length; columnIndex += 1) {
  const firstValidIndex = payload.nivel.data.findIndex((row) => row[columnIndex] !== null);
  firstValidRows.push(base100DataStartRow + firstValidIndex);
}
const base100Formulas = payload.nivel.data.map((_, rowIndex) => {
  const sourceRow = base100DataStartRow + rowIndex;
  const row = [`='Nivel Setorial'!A${sourceRow}`];
  for (let columnIndex = 1; columnIndex < payload.nivel.columns.length; columnIndex += 1) {
    const column = colLetter(columnIndex + 1);
    const baseRow = firstValidRows[columnIndex - 1];
    row.push(
      `=IF('Nivel Setorial'!${column}${sourceRow}=\"\",\"\",'Nivel Setorial'!${column}${sourceRow}/'Nivel Setorial'!${column}$${baseRow}*100)`,
    );
  }
  return row;
});
sheets.nivelBase100.getRange(`A5:R${base100LastRow}`).formulas = base100Formulas;
sheets.nivelBase100.getRange(`A5:A${base100LastRow}`).format.numberFormat = "mmm yyyy";
sheets.nivelBase100.getRange(`B5:R${base100LastRow}`).format.numberFormat = "0.0;[Red](0.0);-";
sheets.nivelBase100.getRange(`A5:R${base100LastRow}`).format = {
  font: { color: colors.formula, size: 9 },
  verticalAlignment: "center",
};
sheets.nivelBase100.getRange("A:A").format.columnWidth = 13;
for (let columnIndex = 2; columnIndex <= 18; columnIndex += 1) {
  const column = colLetter(columnIndex);
  sheets.nivelBase100.getRange(`${column}:${column}`).format.columnWidth = 18;
}
const base100Table = sheets.nivelBase100.tables.add(`A4:R${base100LastRow}`, true, "tblNivelBase100");
base100Table.style = "TableStyleMedium2";
base100Table.showFilterButton = true;
base100Table.showBandedColumns = false;
sheets.nivelBase100.freezePanes.freezeRows(4);
sheets.nivelBase100.freezePanes.freezeColumns(1);

const revisionInfo = addDataSheet({
  sheet: sheets.revisao,
  title: "Earnings setoriais — revisão em 3 meses",
  subtitle: "Variação da soma em nível entre t-3 e t, calculada somente com empresas observadas nas duas pontas.",
  tableData: payload.revisao,
  tableName: "tblRevisao3M",
  dateColumn: true,
  numberColumns: Array.from({ length: 17 }, (_, index) => index + 2),
});

const coverageInfo = addDataSheet({
  sheet: sheets.cobertura,
  title: "Cobertura do nível setorial",
  subtitle: "Número de empresas disponíveis por setor e mês na série de nível.",
  tableData: payload.cobertura,
  tableName: "tblCoberturaNivel",
  dateColumn: true,
  integerColumns: Array.from({ length: 17 }, (_, index) => index + 2),
});

const revisionCoverageInfo = addDataSheet({
  sheet: sheets.coberturaRevisao,
  title: "Cobertura da revisão em 3 meses",
  subtitle: "Número de empresas comuns às duas pontas da janela t-3/t, por setor e mês.",
  tableData: payload.cobertura_revisao,
  tableName: "tblCoberturaRevisao",
  dateColumn: true,
  integerColumns: Array.from({ length: 17 }, (_, index) => index + 2),
});

const detailInfo = addDataSheet({
  sheet: sheets.detalhe,
  title: "Detalhe da revisão em 3 meses",
  subtitle: "Abertura longa da cesta constante: nível inicial, nível final, revisão e número de empresas comuns.",
  tableData: payload.detalhe_revisao,
  tableName: "tblDetalheRevisao",
  dateColumn: true,
  numberColumns: [3, 4, 5],
  integerColumns: [6],
  columnWidths: { 1: 13, 2: 30, 3: 23, 4: 23, 5: 17, 6: 17 },
});

const baseInfo = addDataSheet({
  sheet: sheets.base,
  title: "Base por empresa",
  subtitle: "Fonte auditável das séries consolidadas após prioridade de arquivo e deduplicação de classes ON/PN.",
  tableData: payload.base_empresa,
  tableName: "tblBaseEmpresa",
  dateColumn: true,
  numberColumns: [3],
  columnWidths: { 1: 13, 2: 32, 3: 16, 4: 29, 5: 24, 6: 24, 7: 38 },
});

const mapInfo = addDataSheet({
  sheet: sheets.mapa,
  title: "Mapa setorial auditado",
  subtitle: "Classificação final usada na consolidação, acompanhada dos campos originais para rastreabilidade.",
  tableData: payload.mapa,
  tableName: "tblMapaSetorial",
  numberColumns: [3],
  columnWidths: { 1: 31, 2: 29, 3: 11, 4: 20, 5: 29, 6: 24, 7: 24, 8: 29, 9: 24, 10: 24 },
});

// Resumo executivo com fórmulas ligadas às abas de séries.
formatTitle(
  sheets.resumo,
  "Earnings setoriais — base consolidada",
  "Painel de navegação da base: último nível, revisão em 3 meses, cobertura e sensibilidades estimadas.",
  "I",
);
sheets.resumo.getRange("A4").values = [["Status dos checks"]];
sheets.resumo.getRange("B4").formulas = [["=IF(COUNTIF('Checks'!F5:F16,\"<>OK\")=0,\"OK\",\"REVISAR\")"]];
sheets.resumo.getRange("C4").values = [["Período"]];
sheets.resumo.getRange("D4").values = [[`${payload.metadata.periodo_inicial} a ${payload.metadata.periodo_final}`]];
sheets.resumo.getRange("E4").values = [["Empresas"]];
sheets.resumo.getRange("F4").values = [[payload.metadata.empresas_apos_deduplicacao_classes]];
sheets.resumo.getRange("G4").values = [["Unidade"]];
sheets.resumo.getRange("H4:I4").merge();
sheets.resumo.getRange("H4").values = [["R$ milhões"]];
sheets.resumo.getRange("A4:I4").format = {
  fill: colors.soft,
  font: { bold: true, color: colors.ink, size: 10 },
  verticalAlignment: "center",
};
sheets.resumo.getRange("B4").format = { fill: colors.greenLight, font: { bold: true, color: colors.green } };
sheets.resumo.getRange("A6:I6").merge();
sheets.resumo.getRange("A6").values = [["Último ponto disponível por setor"]];
sheets.resumo.getRange("A6:I6").format = { fill: colors.ink, font: { bold: true, color: colors.white } };
const summaryHeaders = [
  "Setor",
  "Nível atual",
  "Cobertura",
  "Revisão 3M",
  "Cesta comum",
  "β atividade",
  "Veredito atividade",
  "β juros (bp)",
  "Veredito juros",
];
sheets.resumo.getRange("A7:I7").values = [summaryHeaders];
sheets.resumo.getRange("A7:I7").format = {
  fill: colors.copper,
  font: { bold: true, color: colors.white, size: 10 },
  wrapText: true,
  verticalAlignment: "center",
};
sheets.resumo.getRange("A7").format.rowHeight = 32;

const sensitivityMap = new Map(payload.sensibilidades.data.map((row) => [row[0], row]));
const summaryStart = 8;
const summaryRows = payload.metadata.lista_setores.map((sector, index) => {
  const sensitivity = sensitivityMap.get(sector) ?? [sector, null, null, "sem estimativa", null, null, "sem estimativa"];
  const sectorColumn = colLetter(index + 2);
  return [
    sector,
    null,
    null,
    null,
    null,
    sensitivity[1],
    sensitivity[3] ?? "sem estimativa",
    sensitivity[4],
    sensitivity[6] ?? "sem estimativa",
  ];
});
const summaryLast = summaryStart + summaryRows.length - 1;
sheets.resumo.getRange(`A${summaryStart}:I${summaryLast}`).values = summaryRows;
const summaryFormulas = payload.metadata.lista_setores.map((_, index) => {
  const sectorColumn = colLetter(index + 2);
  return [
    `='Nivel Setorial'!${sectorColumn}${levelInfo.lastRow}`,
    `='Cobertura'!${sectorColumn}${coverageInfo.lastRow}`,
    `='Revisao 3M'!${sectorColumn}${revisionInfo.lastRow}`,
    `='Cobertura Revisao'!${sectorColumn}${revisionCoverageInfo.lastRow}`,
  ];
});
sheets.resumo.getRange(`B${summaryStart}:E${summaryLast}`).formulas = summaryFormulas;
sheets.resumo.getRange(`B${summaryStart}:B${summaryLast}`).format.numberFormat = "#,##0.0;[Red](#,##0.0);-";
sheets.resumo.getRange(`C${summaryStart}:C${summaryLast}`).format.numberFormat = "#,##0";
sheets.resumo.getRange(`D${summaryStart}:D${summaryLast}`).format.numberFormat = "#,##0.0;[Red](#,##0.0);-";
sheets.resumo.getRange(`E${summaryStart}:E${summaryLast}`).format.numberFormat = "#,##0";
sheets.resumo.getRange(`F${summaryStart}:F${summaryLast}`).format.numberFormat = "0.00";
sheets.resumo.getRange(`H${summaryStart}:H${summaryLast}`).format.numberFormat = "0.000";
sheets.resumo.getRange(`B${summaryStart}:E${summaryLast}`).format.font = { color: colors.formula };
sheets.resumo.getRange(`A${summaryStart}:I${summaryLast}`).format.verticalAlignment = "center";
const summaryTable = sheets.resumo.tables.add(`A7:I${summaryLast}`, true, "tblResumoSetores");
summaryTable.style = "TableStyleMedium2";
summaryTable.showFilterButton = true;
sheets.resumo.getRange(`A${summaryLast + 2}:I${summaryLast + 2}`).merge();
sheets.resumo.getRange(`A${summaryLast + 2}`).values = [[
  "Nota: β de atividade e β de juros são saídas dos modelos analíticos já produzidos; use as abas de séries para reestimação e auditoria.",
]];
sheets.resumo.getRange(`A${summaryLast + 2}:I${summaryLast + 2}`).format = {
  fill: colors.copperLight,
  font: { color: colors.ink, italic: true, size: 9 },
  wrapText: true,
};
sheets.resumo.getRange(`A${summaryLast + 2}`).format.rowHeight = 28;
const summaryWidths = [30, 16, 12, 16, 13, 14, 21, 14, 19];
summaryWidths.forEach((width, index) => {
  const column = colLetter(index + 1);
  sheets.resumo.getRange(`${column}:${column}`).format.columnWidth = width;
});
sheets.resumo.freezePanes.freezeRows(7);
sheets.resumo.freezePanes.freezeColumns(1);

// Metodologia e fontes.
formatTitle(
  sheets.metodologia,
  "Metodologia e linhagem",
  "Definições necessárias para interpretar corretamente a base e reproduzir os resultados.",
  "C",
);
const methodology = [
  ["Tema", "Definição", "Implicação prática"],
  ["Nível setorial", "Soma dos earnings de todas as empresas disponíveis no setor em cada mês.", "Mudanças de cobertura podem afetar o nível; por isso a contagem de empresas é publicada separadamente."],
  ["Revisão 3M", "Diferença entre a soma dos earnings em t e em t-3, usando apenas empresas com observação nas duas pontas.", "A cesta constante evita confundir revisão de estimativa com entrada ou saída de empresa da amostra."],
  ["Valores negativos", "Perdas são mantidas com sinal negativo; não há transformação logarítmica na série principal.", "A métrica preserva economicamente deteriorações que atravessam zero."],
  ["Classes ON/PN", "Séries com a mesma raiz econômica são deduplicadas; fica a classe com maior cobertura mensal.", "Evita dupla contagem de uma mesma companhia."],
  ["Prioridade de arquivo", "Se a empresa possui mais de uma observação no mesmo mês, prevalece a fonte com maior prioridade definida na base original.", "Mantém uma observação por empresa/mês."],
  ["Unidade", "R$ milhões, conforme a base Bloomberg BEst Net Income recebida.", "Não aplicar nova escala antes de conferir a unidade do estudo de destino."],
  ["Índice base 100", "Cada setor é dividido pela primeira observação válida de sua própria série de nível e multiplicado por 100.", "Facilita comparar trajetórias; não elimina o efeito de mudanças de cobertura."],
  ["β atividade", "Beta padronizado do modelo setorial de earnings versus atividade; exibido apenas como referência no Resumo.", "É associação estimada, não causalidade."],
  ["β juros", "Campo bp do arquivo oficial de sensibilidade setorial a juros; exibido apenas como referência no Resumo.", "É saída do modelo de retornos e não substitui a série bruta."],
];
sheets.metodologia.getRange(`A4:C${3 + methodology.length}`).values = methodology;
sheets.metodologia.getRange("A4:C4").format = { fill: colors.copper, font: { bold: true, color: colors.white }, wrapText: true };
sheets.metodologia.getRange(`A5:C${3 + methodology.length}`).format = { wrapText: true, verticalAlignment: "top", font: { color: colors.ink, size: 10 } };
for (let row = 5; row <= 3 + methodology.length; row += 1) sheets.metodologia.getRange(`A${row}`).format.rowHeight = 56;
const sourceStart = 5 + methodology.length;
sheets.metodologia.getRange(`A${sourceStart}:C${sourceStart}`).merge();
sheets.metodologia.getRange(`A${sourceStart}`).values = [["Fontes e artefatos de auditoria"]];
sheets.metodologia.getRange(`A${sourceStart}:C${sourceStart}`).format = { fill: colors.ink, font: { bold: true, color: colors.white } };
const sources = [
  ["Base primária", "companies_raw.pkl", "Séries Bloomberg BEst Net Income consolidadas no projeto."],
  ["Mapa final", "mapa_sector_xp_auditado.pkl", "Mapa setorial auditado usado neste arquivo."],
  ["Atividade", "11_resultados_nivel.csv", "Resultados do teste principal com delta da soma em nível."],
  ["Juros", "setores_beta_juros_oficial.csv", "Sensibilidades oficiais utilizadas no Resumo."],
  ["Preparação", "13_preparar_series_earnings.py", "Script reprodutível que gera as tabelas-fonte da planilha."],
];
sheets.metodologia.getRange(`A${sourceStart + 1}:C${sourceStart + sources.length}`).values = sources;
sheets.metodologia.getRange(`A${sourceStart + 1}:C${sourceStart + sources.length}`).format = { wrapText: true, verticalAlignment: "top", font: { size: 9, color: colors.ink } };
sheets.metodologia.getRange("A:A").format.columnWidth = 24;
sheets.metodologia.getRange("B:B").format.columnWidth = 58;
sheets.metodologia.getRange("C:C").format.columnWidth = 72;
sheets.metodologia.freezePanes.freezeRows(4);

// Checks visíveis e formula-driven.
formatTitle(sheets.checks, "Checks de integridade", "Validações de dimensão, datas, mapeamento e cobertura do arquivo.", "G");
const checkHeaders = ["Check", "Atual", "Esperado", "Diferença", "Tolerância", "Status", "Observação"];
sheets.checks.getRange("A4:G4").values = [checkHeaders];
sheets.checks.getRange("A4:G4").format = { fill: colors.copper, font: { bold: true, color: colors.white }, wrapText: true };
const checkRows = [
  ["Setores na aba de nível", null, 17, null, 0, null, "Colunas setoriais esperadas"],
  ["Meses na aba de nível", null, payload.metadata.meses, null, 0, null, "Série mensal completa"],
  ["Setores na aba de revisão", null, 17, null, 0, null, "Colunas setoriais esperadas"],
  ["Meses na aba de revisão", null, payload.revisao.data.length, null, 0, null, "Três observações a menos pela janela"],
  ["Último mês: nível x cobertura", null, null, null, 0, null, "Datas devem coincidir"],
  ["Último mês: revisão x cobertura", null, null, null, 0, null, "Datas devem coincidir"],
  ["Linhas da base por empresa", null, payload.metadata.linhas_base_empresa, null, 0, null, "Após deduplicação"],
  ["Linhas do mapa auditado", null, payload.mapa.data.length, null, 0, null, "Inclui todas as séries mapeadas"],
  ["Setores vazios no mapa final", null, 0, null, 0, null, "Nenhum mapeamento final pode estar vazio"],
  ["Setores na aba Base 100", null, 17, null, 0, null, "Colunas setoriais esperadas"],
  ["Meses na aba Base 100", null, payload.metadata.meses, null, 0, null, "Mesmo eixo mensal da série de nível"],
  ["Primeira observação válida = 100", null, 0, null, 0, null, "Soma dos desvios absolutos nas 17 bases"],
];
sheets.checks.getRange("A5:G16").values = checkRows;
const base100DeviationFormula = "=" + firstValidRows
  .map((row, index) => `ABS('Nivel Base 100'!${colLetter(index + 2)}${row}-100)`)
  .join("+");
const actualFormulas = [
  `=COUNTA('Nivel Setorial'!B4:R4)`,
  `=COUNTA('Nivel Setorial'!A5:A${levelInfo.lastRow})`,
  `=COUNTA('Revisao 3M'!B4:R4)`,
  `=COUNTA('Revisao 3M'!A5:A${revisionInfo.lastRow})`,
  `='Nivel Setorial'!A${levelInfo.lastRow}`,
  `='Revisao 3M'!A${revisionInfo.lastRow}`,
  `=COUNTA('Base Empresa'!B5:B${baseInfo.lastRow})`,
  `=COUNTA('Mapa Setorial'!A5:A${mapInfo.lastRow})`,
  `=COUNTBLANK('Mapa Setorial'!E5:E${mapInfo.lastRow})`,
  `=COUNTA('Nivel Base 100'!B4:R4)`,
  `=COUNTA('Nivel Base 100'!A5:A${base100LastRow})`,
  base100DeviationFormula,
].map((formula) => [formula]);
const expectedFormulas = [
  "=17",
  `=${payload.metadata.meses}`,
  "=17",
  `=${payload.revisao.data.length}`,
  `='Cobertura'!A${coverageInfo.lastRow}`,
  `='Cobertura Revisao'!A${revisionCoverageInfo.lastRow}`,
  `=${payload.metadata.linhas_base_empresa}`,
  `=${payload.mapa.data.length}`,
  "=0",
  "=17",
  `=${payload.metadata.meses}`,
  "=0",
].map((formula) => [formula]);
sheets.checks.getRange("B5:B16").formulas = actualFormulas;
sheets.checks.getRange("C5:C16").formulas = expectedFormulas;
sheets.checks.getRange("D5").formulas = [["=B5-C5"]];
sheets.checks.getRange("D5:D16").fillDown();
sheets.checks.getRange("F5").formulas = [["=IF(ABS(D5)<=E5,\"OK\",\"ERRO\")"]];
sheets.checks.getRange("F5:F16").fillDown();
sheets.checks.getRange("B5:F16").format.font = { color: colors.formula };
sheets.checks.getRange("B9:C10").format.numberFormat = "mmm yyyy";
sheets.checks.getRange("A5:G16").format.verticalAlignment = "center";
sheets.checks.getRange("A:A").format.columnWidth = 33;
sheets.checks.getRange("B:F").format.columnWidth = 14;
sheets.checks.getRange("G:G").format.columnWidth = 39;
sheets.checks.freezePanes.freezeRows(4);

// Compact inspection and error scan before export.
const summaryInspect = await workbook.inspect({
  kind: "table",
  range: "Resumo!A1:I26",
  include: "values,formulas",
  tableMaxRows: 26,
  tableMaxCols: 9,
  maxChars: 10000,
});
console.log(summaryInspect.ndjson);

const base100Inspect = await workbook.inspect({
  kind: "table",
  range: "Nivel Base 100!A4:R18",
  include: "values,formulas",
  tableMaxRows: 15,
  tableMaxCols: 18,
  maxChars: 9000,
});
console.log(base100Inspect.ndjson);

const checkInspect = await workbook.inspect({
  kind: "table",
  range: "Checks!A1:G16",
  include: "values,formulas",
  tableMaxRows: 16,
  tableMaxCols: 7,
  maxChars: 7000,
});
console.log(checkInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 5000,
});
console.log(errors.ndjson);

const previewRanges = {
  Resumo: `A1:I${summaryLast + 2}`,
  "Nivel Setorial": "A1:R18",
  "Nivel Base 100": "A1:R18",
  "Revisao 3M": "A1:R18",
  Cobertura: "A1:R18",
  "Cobertura Revisao": "A1:R18",
  "Detalhe Revisao": "A1:F22",
  "Base Empresa": "A1:G22",
  "Mapa Setorial": "A1:J22",
  Metodologia: `A1:C${sourceStart + sources.length}`,
  Checks: "A1:G16",
};
for (const [sheetName, range] of Object.entries(previewRanges)) {
  const preview = await workbook.render({ sheetName, range, scale: 1.25, format: "png" });
  const safeName = sheetName.toLowerCase().replaceAll(" ", "_");
  await fs.writeFile(path.join(previewDir, `${safeName}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, previewDir, sheets: Object.keys(previewRanges) }, null, 2));
