function onCardInitialize() {
  MarkCalendarTask();
  DoneInspectionTask();
  ConfirmPaymentTask();
}

function onCreate() {
  EdocsApi.setAttributeValue({ code: "SubgectAccount", value: "Надання технічних послуг із інспектування локомотивів", text: null });
  //EdocsApi.setAttributeValue({ code: "AccountInvoice", value: "13735,10", text: null });
  EdocsApi.setAttributeValue({ code: "OrgRPEmail", value: EdocsApi.getEmployeeDataByEmployeeID(CurrentDocument.initiatorId).email, text: null });
  setContractorHome();
  calculationInvoiceAmount();
}

function setContractorHome() {
  if (!EdocsApi.getAttributeValue("HomeOrgName").value) {
    try {
      const data = EdocsApi.getContractorByCode("40081293", "homeOrganization");
      EdocsApi.setAttributeValue({ code: "HomeOrgName", value: data.fullName });
      EdocsApi.setAttributeValue({ code: "HomeOrgIPN", value: data.taxId });
      EdocsApi.setAttributeValue({ code: "LegaladdressOrg", value: data.legalAddress });
      EdocsApi.setAttributeValue({ code: "OrgShortName", value: data.shortName });
      EdocsApi.setAttributeValue({ code: "OrgCode", value: "40081293" });
    } catch (error) {
      EdocsApi.message(error);
    }
  }
}

//Скрипт 1. Вирахування ПДВ рахунку
function calculationInvoiceAmount() {
  debugger;
  let VATpercentage = 0;
  const attrVATAmount = EdocsApi.getAttributeValue("InvoiceVATAmount");
  const attrVATpercentage = EdocsApi.getAttributeValue("InvoiceVATPercent");
  const attrContractAmount = EdocsApi.getAttributeValue("AccountInvoice");
  const attrAmountOutVAT = EdocsApi.getAttributeValue("InvoiceAmountOutVAT");

  switch (attrVATpercentage.value) {
    case "20%": // if (x === 'если сумма НДС=20%')
      VATpercentage = 1.2;
      break;

    case "7%": // if (x === 'если сумма НДС=7%')
      VATpercentage = 1.07;
      break;
  }

  if (attrVATpercentage.value === null || attrContractAmount.value === null) {
    // если нет ставки НДС и суммы, то укажем ноль в сумме НДС и без НДС
    attrVATAmount.value = 0;
    attrAmountOutVAT.value = 0;
  } else if (VATpercentage == 0) {
    attrVATAmount.value = 0;
    attrAmountOutVAT.value = attrContractAmount.value;
  } else {
    attrAmountOutVAT.value = Math.floor((100 * attrContractAmount.value) / VATpercentage) / 100;
    attrVATAmount.value = attrContractAmount.value - attrAmountOutVAT.value;
  }

  EdocsApi.setAttributeValue(attrVATAmount);
  EdocsApi.setAttributeValue(attrAmountOutVAT);
}

function onChangeAccountInvoice() {
  debugger;
  calculationInvoiceAmount();
}

function onChangeInvoiceVATPercent() {
  debugger;
  calculationInvoiceAmount();
}

//Скрипт 2. Передача рахунку для ознайомлення з погодженням  в зовнішню систему
function setDataForESIGN() {
  debugger;
  const registrationDate = EdocsApi.getAttributeValue("RegDate").value;
  const registrationNumber = EdocsApi.getAttributeValue("RegNumber").value;
  const caseType = EdocsApi.getAttributeValue("DocType").value;
  const caseKind = EdocsApi.getAttributeValue("DocKind").text;
  let name = "";
  if (caseKind) {
    name += caseKind;
  } else {
    name += caseType;
  }
  name += " №" + (registrationNumber ? registrationNumber : CurrentDocument.id) + (!registrationDate ? "" : " від " + moment(registrationDate).format("DD.MM.YYYY"));
  doc = {
    DocName: name,
    extSysDocId: CurrentDocument.id,
    ExtSysDocVersion: CurrentDocument.version,
    docType: "invoice",
    docDate: registrationDate,
    docNum: registrationNumber,
    File: "",
    parties: [
      {
        taskType: "ToSign",
        taskState: "Done",
        legalEntityCode: EdocsApi.getAttributeValue("OrgCode").value,
        contactPersonEmail: EdocsApi.getAttributeValue("OrgRPEmail").value,
        signatures: [],
      },
      {
        taskType: "toRead",
        taskState: "NotAssigned",
        legalEntityCode: EdocsApi.getAttributeValue("EDRPOUContractor").value,
        contactPersonEmail: EdocsApi.getAttributeValue("ContractorRPEmail").value,
        expectedSignatures: [],
      },
    ],
    additionalAttributes: [
      {
        code: "docDate",
        type: "dateTime",
        value: registrationDate,
      },
      {
        code: "docNum",
        type: "string",
        value: registrationNumber,
      },
    ],
    sendingSettings: {
      attachFiles: "fixed", //, можна також встановлювати 'firstOnly' - Лише файл із першої зафіксованої вкладки(Головний файл), або 'all' - всі файли, 'fixed' - усі зафіксовані
      attachSignatures: "signatureAndStamp", // -'signatureAndStamp'Типи “Підпис” або “Печатка”, можна також встановити 'all' - усі типи цифрових підписів
    },
  };
  EdocsApi.setAttributeValue({ code: "JSON", value: JSON.stringify(doc) });
}

function onTaskExecuteSendOutDoc(routeStage) {
  debugger;
  if (routeStage.executionResult == "rejected") {
    return;
  }
  setDataForESIGN();
  const idnumber = EdocsApi.getAttributeValue("DocId");
  const methodData = {
    ExtSysDocVersion: CurrentDocument.version,
    extSysDocId: idnumber.value,
  };

  routeStage.externalAPIExecutingParams = {
    externalSystemCode: "ESIGN1", // код зовнішньої системи
    externalSystemMethod: "integration/importDoc", // метод зовнішньої системи
    data: methodData, // дані, що очікує зовнішня система для заданого методу
    executeAsync: true, // виконувати завдання асинхронно
  };
}

function onTaskCommentedSendOutDoc(caseTaskComment) {
  debugger;
  const orgCode = EdocsApi.getAttributeValue("OrgCode").value;
  const orgShortName = EdocsApi.getAttributeValue("OrgShortName").value;
  if (!orgCode || !orgShortName) {
    return;
  }
  const idnumber = EdocsApi.getAttributeValue("DocId");
  const methodData = {
    extSysDocId: idnumber.value,
    eventType: "CommentAdded",
    comment: caseTaskComment.comment,
    partyCode: orgCode,
    userTitle: CurrentUser.name,
    partyName: orgShortName,
    occuredAt: new Date(),
  };

  caseTaskComment.externalAPIExecutingParams = {
    externalSystemCode: "ESIGN1", // код зовнішньої системи
    externalSystemMethod: "integration/processEvent", // метод зовнішньої системи
    data: methodData, // дані, що очікує зовнішня система для заданого методу
    executeAsync: true, // виконувати завдання асинхронно
  };
}

//Скрипт 3. Обов’язковість заповнення поля
function onTaskExecuteMarkCalendar(routeStage) {
  debugger;
  if (routeStage.executionResult == "executed") {
    sendComment(routeStage);
  }
}

function sendComment(routeStage) {
  debugger;
  var orgCode = EdocsApi.getAttributeValue("OrgCode").value;
  var orgShortName = EdocsApi.getAttributeValue("OrgShortName").value;
  if (!orgCode || !orgShortName) {
    return;
  }
  const NumberContract = EdocsApi.getAttributeValue("NumberContract");
  const DateContract = EdocsApi.getAttributeValue("DateContract").value;
  const InspectionDate = EdocsApi.getAttributeValue("InspectionDate").value;
  var comment = `Доброго дня! Повідомляємо, що на виконання Договору про надання послуг інспектування № ${NumberContract.value ? NumberContract.value : " "} від ${DateContract ? (new Date(DateContract).getDate() < 10 ? "0" + new Date(DateContract).getDate() : new Date(DateContract).getDate()) + "-" + (new Date(DateContract).getMonth() + 1 < 10 ? "0" + Number(new Date(DateContract).getMonth() + 1) : Number(new Date(DateContract).getMonth() + 1)) + "-" + new Date(DateContract).getFullYear() : " "}, призначена наступна дата інспектування – ${new Date(InspectionDate).getDate()}-${new Date(InspectionDate).getMonth() + 1 < 10 ? "0" + Number(new Date(InspectionDate).getMonth() + 1) : Number(new Date(InspectionDate).getMonth() + 1)}-${new Date(InspectionDate).getFullYear()}. З повагою, Філія «НДКТІ» АТ «Укрзалізниця».`;

  var methodData = {
    extSysDocId: CurrentDocument.id,
    eventType: "CommentAdded",
    comment: comment,
    partyCode: orgCode,
    userTitle: CurrentUser.name,
    partyName: orgShortName,
    occuredAt: new Date(),
  };
  routeStage.externalAPIExecutingParams = {
    externalSystemCode: "ESIGN1",
    externalSystemMethod: "integration/processEvent",
    data: methodData,
    executeAsync: false,
  };
}

function MarkCalendarTask() {
  debugger;
  const stateTask = EdocsApi.getCaseTaskDataByCode("MarkCalendar").state;
  switch (stateTask) {
    case "draft":
      controlRequired("InspectionDate", false);
      controlDisabled("InspectionDate");
      controlHidden("InspectionDate");
      break;

    case "assigned":
      controlDisabled("InspectionDate", false);
      controlRequired("InspectionDate");
      controlHidden("InspectionDate", false);
      break;

    case "delegated":
      controlDisabled("InspectionDate", false);
      controlRequired("InspectionDate");
      controlHidden("InspectionDate", false);
      break;

    case "inProgress":
      controlDisabled("InspectionDate", false);
      controlRequired("InspectionDate");
      controlHidden("InspectionDate", false);
      break;

    case "completed":
      controlDisabled("InspectionDate");
      controlHidden("InspectionDate", false);
      break;

    default:
      break;
  }
}

function controlHidden(CODE, hidden = true) {
  const control = EdocsApi.getControlProperties(CODE);
  control.hidden = hidden;
  EdocsApi.setControlProperties(control);
}

function controlDisabled(CODE, disabled = true) {
  const control = EdocsApi.getControlProperties(CODE);
  control.disabled = disabled;
  EdocsApi.setControlProperties(control);
}

function controlRequired(CODE, required = true) {
  const control = EdocsApi.getControlProperties(CODE);
  control.required = required;
  EdocsApi.setControlProperties(control);
}

//UZKARGO-209
function ConfirmPaymentTask() {
  debugger;
  var stateTask = EdocsApi.getCaseTaskDataByCode("ConfirmPayment")?.state;

  if (stateTask == "assigned" || stateTask == "inProgress" || stateTask == "delegated") {
    setPropertyRequired("StatusAccount");
    setPropertyHidden("StatusAccount", false);
    setPropertyDisabled("StatusAccount", false);
  } else if (stateTask == "completed") {
    setPropertyRequired("StatusAccount");
    setPropertyHidden("StatusAccount", false);
    setPropertyDisabled("StatusAccount");
  } else {
    setPropertyRequired("StatusAccount", false);
    setPropertyHidden("StatusAccount");
    setPropertyDisabled("StatusAccount", false);
  }
}

function onTaskExecuteConfirmPayment(routeStage) {
  debugger;
  if (routeStage.executionResult == "executed") {
    if (!EdocsApi.getAttributeValue("StatusAccount").value) throw `Внесіть значення в поле "Статус оплати рахунку"`;
  }
}

function onTaskExecutedSendOutDoc(routeStage) {
  debugger;
  if (routeStage.executionResult == "executed") {
    ConfirmPaymentTask();
  }
}

function DoneInspectionTask() {
  debugger;
  var stateTask = EdocsApi.getCaseTaskDataByCode("DoneInspection")?.state;

  if (stateTask == "assigned" || stateTask == "inProgress" || stateTask == "delegated") {
    setPropertyRequired("StatusInspection");
    setPropertyHidden("StatusInspection", false);
    setPropertyDisabled("StatusInspection", false);
    setPropertyHidden("CheckDate", false);
  } else if (stateTask == "completed") {
    setPropertyRequired("StatusInspection");
    setPropertyHidden("StatusInspection", false);
    setPropertyDisabled("StatusInspection");
    controlDisabled("InspectionDate");
    setPropertyHidden("CheckDate", false);
  } else {
    setPropertyRequired("StatusInspection", false);
    setPropertyHidden("StatusInspection");
    setPropertyDisabled("StatusInspection", false);
    setPropertyHidden("CheckDate");
  }
}

function onTaskExecuteDoneInspection(routeStage) {
  debugger;
  if (routeStage.executionResult == "executed") {
    if (!EdocsApi.getAttributeValue("StatusInspection").value) throw `Внесіть значення в поле "Статус проведення інспектування"`;
    if (EdocsApi.getAttributeValue("CheckDate").value && !EdocsApi.getAttributeValue("NewDateInspection").value) throw `Внесіть значення в поле "Нова дата інспектування`;
  }
}

function setPropNewDateInspection() {
  var CheckDate = EdocsApi.getAttributeValue("CheckDate").value;
  if (CheckDate) {
    setPropertyRequired("NewDateInspection");
    setPropertyHidden("NewDateInspection", false);
  } else {
    setPropertyRequired("NewDateInspection", false);
    setPropertyHidden("NewDateInspection");
  }
}

function onChangeCheckDate() {
  setPropNewDateInspection();
}
