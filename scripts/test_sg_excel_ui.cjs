const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const source = fs.readFileSync("docs/app.js", "utf8");
const start = source.indexOf("function parseSgExcelWorkbook(workbook) {");
const end = source.indexOf("function sgCsvQuote(", start);
assert(start >= 0 && end > start, "SG Excel parser not found");
const context = {XLSX: {utils: {sheet_to_json: sheet => sheet.rows}}};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const make = rows => ({SheetNames: ["Sheet1"], Sheets: {Sheet1: {rows}}});
const headers = ["Product ID", "Parent SKU", "Product Name", "Product Description", "Fail Reason"];
const data = [
  ["et_title_product_id", "et_title_parent_sku", "et_title_product_name"],
  ["basic_info", "meta", "0"],
  headers, [], [], [],
  ["100", "s-B0FG7YPB4N-20261109", "Product Black"],
  ["101", "s-B0FG7YPB4N-20261110", "Product White"],
  ["102", "s-B0DWDSDP17-20261109", "Another Product"]
];
const parsed = context.parseSgExcelWorkbook(make(data));
assert.equal(parsed.catalog.length, 3);
assert.equal(parsed.asins.length, 2);
assert.equal(parsed.catalog[0][0], "B0FG7YPB4N");
assert.throws(() => context.parseSgExcelWorkbook(make([...data, ["103", "bad-sku", "Bad"]])), /ASIN/);
assert.throws(() => context.parseSgExcelWorkbook(make([...data, ["", "s-B0FG7YPB4N-20261109", "Bad"]])), /欠損/);
console.log("SG single Excel parsing tests passed");
