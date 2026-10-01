#include "database_repository.h"

#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <limits>
#include <sstream>

namespace {
thread_local SQLLEN textIndicators[64];

void loadEnvFile() {
    std::ifstream envFile(".env");
    if (!envFile.is_open()) return;
    std::string line;
    while (std::getline(envFile, line)) {
        const std::size_t start = line.find_first_not_of(" \t\r\n");
        if (start == std::string::npos || line[start] == '#') continue;
        const std::size_t eq = line.find('=', start);
        if (eq == std::string::npos) continue;
        std::string key = line.substr(start, eq - start);
        const std::size_t keyEnd = key.find_last_not_of(" \t\r\n");
        if (keyEnd != std::string::npos) key = key.substr(0, keyEnd + 1);
        std::string val = line.substr(eq + 1);
        const std::size_t valStart = val.find_first_not_of(" \t\r\n");
        const std::size_t valEnd = val.find_last_not_of(" \t\r\n");
        val = (valStart == std::string::npos) ? "" : val.substr(valStart, valEnd - valStart + 1);
        if (val.size() >= 2 && ((val.front() == '"' && val.back() == '"') || (val.front() == '\'' && val.back() == '\''))) {
            val = val.substr(1, val.size() - 2);
        }
        if (std::getenv(key.c_str()) == nullptr) {
#ifdef _WIN32
            _putenv_s(key.c_str(), val.c_str());
#else
            setenv(key.c_str(), val.c_str(), 0);
#endif
        }
    }
}

bool succeeded(SQLRETURN result) {
    return result == SQL_SUCCESS || result == SQL_SUCCESS_WITH_INFO;
}

const char* environmentValue(const char* name) {
    const char* value = std::getenv(name);
    return value != nullptr && value[0] != '\0' ? value : nullptr;
}

bool bindInt(SQLHSTMT statement, SQLUSMALLINT parameter, int& value) {
    return succeeded(SQLBindParameter(statement, parameter, SQL_PARAM_INPUT, SQL_C_SLONG,
                                     SQL_INTEGER, 0, 0, &value, 0, nullptr));
}

bool bindDouble(SQLHSTMT statement, SQLUSMALLINT parameter, double& value) {
    return succeeded(SQLBindParameter(statement, parameter, SQL_PARAM_INPUT, SQL_C_DOUBLE,
                                     SQL_DOUBLE, 0, 0, &value, 0, nullptr));
}

bool bindText(SQLHSTMT statement, SQLUSMALLINT parameter, const std::string& value) {
    if (parameter < 64) {
        textIndicators[parameter] = SQL_NTS;
    }
    SQLULEN colSize = value.empty() ? 1 : static_cast<SQLULEN>(value.size());
    SQLLEN bufferLen = static_cast<SQLLEN>(value.size() + 1);
    return succeeded(SQLBindParameter(statement, parameter, SQL_PARAM_INPUT, SQL_C_CHAR,
                                     SQL_VARCHAR, colSize, 0,
                                     const_cast<char*>(value.c_str()), bufferLen,
                                     (parameter < 64) ? &textIndicators[parameter] : nullptr));
}

std::string numericColumn(const std::string& parameter) {
    if (parameter == "Severity") return "Severity";
    if (parameter == "Current_Treatment_Cost(INR)") return "CurrentTreatmentCost";
    if (parameter == "Total_expenditure(INR)") return "TotalExpenditure";
    if (parameter == "Optimal Cost") return "OptimalCost";
    return "";
}

std::string stringColumn(const std::string& parameter) {
    if (parameter == "Name") return "Name";
    if (parameter == "Blood Group") return "BloodGroup";
    if (parameter == "Address") return "Address";
    if (parameter == "Condition") return "Condition";
    if (parameter == "Area of Treatment") return "AreaOfTreatment";
    if (parameter == "Insurance") return "Insurance";
    if (parameter == "Phone Number") return "PhoneNumber";
    return "";
}
}

DatabaseRepository::DatabaseRepository() : environment_(SQL_NULL_HENV), connection_(SQL_NULL_HDBC) {}

DatabaseRepository::~DatabaseRepository() {
    disconnect();
}

DatabaseRepository& database() {
    static DatabaseRepository repository;
    return repository;
}

void DatabaseRepository::printDiagnostics(SQLSMALLINT handleType, SQLHANDLE handle,
                                          const char* context) const {
    std::cerr << "Database Error" << (context ? std::string(" during ") + context : "") << ":\n";
    SQLCHAR state[7]{};
    SQLCHAR message[512]{};
    SQLINTEGER nativeError = 0;
    SQLSMALLINT messageLength = 0;
    for (SQLSMALLINT record = 1;
         SQLGetDiagRecA(handleType, handle, record, state, &nativeError, message,
                        sizeof(message), &messageLength) == SQL_SUCCESS;
         ++record) {
        std::cerr << "  SQLSTATE: " << state << " | Native Error: " << nativeError
                  << " | Message: " << message << '\n';
    }
}

bool DatabaseRepository::connectFromEnvironment() {
    if (isConnected()) return true;

    loadEnvFile();

    const char* server = environmentValue("DB_SERVER");
    const char* name = environmentValue("DB_NAME");
    if (!server || !name) {
        std::cerr << "ERROR: Could not connect to SQL Server. Set DB_SERVER and DB_NAME.\n";
        return false;
    }

    if (!succeeded(SQLAllocHandle(SQL_HANDLE_ENV, SQL_NULL_HANDLE, &environment_))) {
        std::cerr << "ERROR: Could not allocate the ODBC environment.\n";
        return false;
    }
    if (!succeeded(SQLSetEnvAttr(environment_, SQL_ATTR_ODBC_VERSION,
                                 reinterpret_cast<SQLPOINTER>(SQL_OV_ODBC3), 0))) {
        printDiagnostics(SQL_HANDLE_ENV, environment_, "setting ODBC version");
        disconnect();
        return false;
    }
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_DBC, environment_, &connection_))) {
        printDiagnostics(SQL_HANDLE_ENV, environment_, "allocating SQL connection");
        disconnect();
        return false;
    }

    const char* driver = environmentValue("DB_DRIVER");
    const char* user = environmentValue("DB_USER");
    const char* password = environmentValue("DB_PASSWORD");
    std::ostringstream connectionString;
    connectionString << "Driver={" << (driver ? driver : "ODBC Driver 18 for SQL Server") << "};"
                     << "Server=" << server << ";Database=" << name << ";"
                     << "Encrypt=" << (environmentValue("DB_ENCRYPT") ? environmentValue("DB_ENCRYPT") : "yes") << ";"
                     << "TrustServerCertificate="
                     << (environmentValue("DB_TRUST_SERVER_CERTIFICATE") ? environmentValue("DB_TRUST_SERVER_CERTIFICATE") : "yes")
                     << ";";
    if (user && password) {
        connectionString << "UID=" << user << ";PWD=" << password << ";";
    } else {
        connectionString << "Trusted_Connection=Yes;";
    }

    SQLCHAR completed[1024]{};
    SQLSMALLINT completedLength = 0;
    SQLRETURN result = SQLDriverConnectA(connection_, nullptr,
                                         reinterpret_cast<SQLCHAR*>(const_cast<char*>(connectionString.str().c_str())),
                                         SQL_NTS, completed, sizeof(completed), &completedLength,
                                         SQL_DRIVER_NOPROMPT);
    if (!succeeded(result)) {
        printDiagnostics(SQL_HANDLE_DBC, connection_, "connecting to SQL Server");
        disconnect();
        std::cerr << "ERROR: Could not connect to SQL Server. Please check database configuration.\n";
        return false;
    }
    return true;
}

void DatabaseRepository::disconnect() {
    if (connection_ != SQL_NULL_HDBC) {
        SQLDisconnect(connection_);
        SQLFreeHandle(SQL_HANDLE_DBC, connection_);
        connection_ = SQL_NULL_HDBC;
    }
    if (environment_ != SQL_NULL_HENV) {
        SQLFreeHandle(SQL_HANDLE_ENV, environment_);
        environment_ = SQL_NULL_HENV;
    }
}

bool DatabaseRepository::isConnected() const {
    return connection_ != SQL_NULL_HDBC;
}

bool DatabaseRepository::execute(SQLHSTMT statement, const char* context) {
    SQLRETURN result = SQLExecute(statement);
    if (!succeeded(result)) {
        printDiagnostics(SQL_HANDLE_STMT, statement, context);
        return false;
    }
    return true;
}

bool DatabaseRepository::beginTransaction() {
    SQLRETURN result = SQLSetConnectAttr(connection_, SQL_ATTR_AUTOCOMMIT,
                                         reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_OFF), 0);
    if (!succeeded(result)) printDiagnostics(SQL_HANDLE_DBC, connection_, "starting transaction");
    return succeeded(result);
}

bool DatabaseRepository::finishTransaction(bool commit) {
    SQLRETURN result = SQLEndTran(SQL_HANDLE_DBC, connection_, commit ? SQL_COMMIT : SQL_ROLLBACK);
    if (!succeeded(result)) printDiagnostics(SQL_HANDLE_DBC, connection_, "finishing transaction");
    SQLSetConnectAttr(connection_, SQL_ATTR_AUTOCOMMIT,
                      reinterpret_cast<SQLPOINTER>(SQL_AUTOCOMMIT_ON), 0);
    return succeeded(result);
}

bool DatabaseRepository::copyTo(char* target, std::size_t targetSize, const char* source) {
    if (!target || targetSize == 0) return false;
    std::strncpy(target, source ? source : "", targetSize - 1);
    target[targetSize - 1] = '\0';
    return true;
}

bool DatabaseRepository::loadHospitalData(int matrix[HOSPITAL_COUNT][HOSPITAL_COUNT],
                                          int casualties[HOSPITAL_COUNT][HOSPITAL_COUNT],
                                          int weights[HOSPITAL_COUNT][HOSPITAL_COUNT],
                                          char hospitalNames[HOSPITAL_COUNT][50]) {
    std::memset(matrix, 0, sizeof(int) * HOSPITAL_COUNT * HOSPITAL_COUNT);
    std::memset(casualties, 0, sizeof(int) * HOSPITAL_COUNT * HOSPITAL_COUNT);
    std::memset(weights, 0, sizeof(int) * HOSPITAL_COUNT * HOSPITAL_COUNT);
    SQLHSTMT statement = SQL_NULL_HSTMT;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    bool ok = succeeded(SQLExecDirectA(statement,
        reinterpret_cast<SQLCHAR*>(const_cast<char*>("SELECT HospitalID, HospitalName FROM Hospitals ORDER BY HospitalID")), SQL_NTS));
    if (!ok) printDiagnostics(SQL_HANDLE_STMT, statement, "loading hospitals");
    int namesRead = 0;
    while (ok && SQLFetch(statement) == SQL_SUCCESS) {
        int id = 0; char name[50]{}; SQLLEN indicator = 0;
        SQLGetData(statement, 1, SQL_C_SLONG, &id, 0, &indicator);
        SQLGetData(statement, 2, SQL_C_CHAR, name, sizeof(name), &indicator);
        if (id < 1 || id > HOSPITAL_COUNT) continue;
        else { copyTo(hospitalNames[id - 1], 50, name); ++namesRead; }
    }
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    if (!ok || namesRead != HOSPITAL_COUNT) {
        std::cerr << "Database Error: Hospitals must contain IDs 1 through 15.\n";
        return false;
    }
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    ok = succeeded(SQLExecDirectA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(
        "SELECT SourceHospitalID, DestinationHospitalID, IsConnected, Casualties, Weight FROM HospitalRoutes")), SQL_NTS));
    if (!ok) printDiagnostics(SQL_HANDLE_STMT, statement, "loading hospital routes");
    int routeCount = 0;
    while (ok && SQLFetch(statement) == SQL_SUCCESS) {
        int source = 0, destination = 0, connected = 0, casualty = 0, weight = 0; SQLLEN indicator = 0;
        SQLGetData(statement, 1, SQL_C_SLONG, &source, 0, &indicator);
        SQLGetData(statement, 2, SQL_C_SLONG, &destination, 0, &indicator);
        SQLGetData(statement, 3, SQL_C_SLONG, &connected, 0, &indicator);
        SQLGetData(statement, 4, SQL_C_SLONG, &casualty, 0, &indicator);
        SQLGetData(statement, 5, SQL_C_SLONG, &weight, 0, &indicator);
        if (source < 1 || source > HOSPITAL_COUNT || destination < 1 || destination > HOSPITAL_COUNT) { ok = false; break; }
        matrix[source - 1][destination - 1] = connected;
        casualties[source - 1][destination - 1] = casualty;
        weights[source - 1][destination - 1] = weight;
        ++routeCount;
    }
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    if (!ok || routeCount != HOSPITAL_COUNT * HOSPITAL_COUNT) {
        std::cerr << "Database Error: HospitalRoutes must contain all 225 route values.\n";
        return false;
    }
    return true;
}

bool DatabaseRepository::patientExists(int patientId) {
    SQLHSTMT statement = SQL_NULL_HSTMT; int count = 0; SQLLEN indicator = 0;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(
        "SELECT COUNT(*) FROM Patients WHERE PatientID = ?")), SQL_NTS)) && bindInt(statement, 1, patientId) && execute(statement, "checking patient ID");
    if (ok && SQLFetch(statement) == SQL_SUCCESS) SQLGetData(statement, 1, SQL_C_SLONG, &count, 0, &indicator);
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    return ok && count > 0;
}

bool DatabaseRepository::getPatientById(int patientId, Patient& patient) {
    SQLHSTMT statement = SQL_NULL_HSTMT;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    const char* query = "SELECT p.PatientID,p.Name,p.Age,p.BloodGroup,p.Gender,p.Address,p.Condition,p.VaccinesDone,p.AreaOfTreatment,p.Insurance,p.PhoneNumber,COALESCE(h.HospitalName,''),p.OptimalCost,p.Severity,p.CurrentTreatmentCost,p.TotalExpenditure FROM Patients p LEFT JOIN Hospitals h ON h.HospitalID=p.HospitalAssignedID WHERE p.PatientID=?";
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(query)), SQL_NTS)) && bindInt(statement, 1, patientId) && execute(statement, "searching patient");
    if (!ok || SQLFetch(statement) == SQL_NO_DATA) { SQLFreeHandle(SQL_HANDLE_STMT, statement); return false; }
    patient = Patient{}; SQLLEN indicator = 0;
    SQLGetData(statement, 1, SQL_C_SLONG, &patient.id, 0, &indicator);
    SQLGetData(statement, 2, SQL_C_CHAR, patient.name, sizeof(patient.name), &indicator);
    SQLGetData(statement, 3, SQL_C_SLONG, &patient.age, 0, &indicator);
    SQLGetData(statement, 4, SQL_C_CHAR, patient.bloodGroup, sizeof(patient.bloodGroup), &indicator);
    SQLGetData(statement, 5, SQL_C_CHAR, &patient.gender, sizeof(patient.gender), &indicator);
    SQLGetData(statement, 6, SQL_C_CHAR, patient.address, sizeof(patient.address), &indicator);
    SQLGetData(statement, 7, SQL_C_CHAR, patient.condition, sizeof(patient.condition), &indicator);
    SQLGetData(statement, 8, SQL_C_CHAR, &patient.vaccinesDone, sizeof(patient.vaccinesDone), &indicator);
    SQLGetData(statement, 9, SQL_C_CHAR, patient.areaOfTreatment, sizeof(patient.areaOfTreatment), &indicator);
    SQLGetData(statement, 10, SQL_C_CHAR, patient.insurance, sizeof(patient.insurance), &indicator);
    SQLGetData(statement, 11, SQL_C_CHAR, patient.phoneNumber, sizeof(patient.phoneNumber), &indicator);
    SQLGetData(statement, 12, SQL_C_CHAR, patient.hospitalAssigned, sizeof(patient.hospitalAssigned), &indicator);
    SQLGetData(statement, 13, SQL_C_DOUBLE, &patient.optimalCost, 0, &indicator);
    SQLGetData(statement, 14, SQL_C_FLOAT, &patient.severity, 0, &indicator);
    SQLGetData(statement, 15, SQL_C_FLOAT, &patient.current_treatment_cost, 0, &indicator);
    SQLGetData(statement, 16, SQL_C_FLOAT, &patient.total_expenditure, 0, &indicator);
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    return true;
}

bool DatabaseRepository::insertPatient(const Patient& patient, int hospitalAssignedId) {
    SQLHSTMT statement = SQL_NULL_HSTMT;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    const char* query = "INSERT INTO Patients (PatientID,Name,Age,BloodGroup,Gender,Address,Condition,VaccinesDone,AreaOfTreatment,Insurance,PhoneNumber,HospitalAssignedID,OptimalCost,Severity,CurrentTreatmentCost,TotalExpenditure) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    int id = patient.id, age = patient.age, hospital = hospitalAssignedId;
    double optimal = patient.optimalCost, severity = patient.severity, treatment = patient.current_treatment_cost, total = patient.total_expenditure;
    std::string nameStr(patient.name);
    std::string bloodStr(patient.bloodGroup);
    std::string genderStr(1, patient.gender ? patient.gender : 'U');
    std::string addressStr(patient.address);
    std::string conditionStr(patient.condition);
    std::string vaccinesStr(1, patient.vaccinesDone ? patient.vaccinesDone : 'U');
    std::string areaStr(patient.areaOfTreatment);
    std::string insuranceStr(patient.insurance);
    std::string phoneStr(patient.phoneNumber);

    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(query)), SQL_NTS))
        && bindInt(statement, 1, id) && bindText(statement, 2, nameStr) && bindInt(statement, 3, age)
        && bindText(statement, 4, bloodStr) && bindText(statement, 5, genderStr)
        && bindText(statement, 6, addressStr) && bindText(statement, 7, conditionStr)
        && bindText(statement, 8, vaccinesStr) && bindText(statement, 9, areaStr)
        && bindText(statement, 10, insuranceStr) && bindText(statement, 11, phoneStr) && bindInt(statement, 12, hospital)
        && bindDouble(statement, 13, optimal) && bindDouble(statement, 14, severity) && bindDouble(statement, 15, treatment) && bindDouble(statement, 16, total)
        && execute(statement, "inserting patient");
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    return ok;
}

bool DatabaseRepository::updatePatient(const Patient& patient) {
    SQLHSTMT statement = SQL_NULL_HSTMT;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    const char* query = "UPDATE Patients SET Name=?,Age=?,BloodGroup=?,VaccinesDone=?,AreaOfTreatment=?,Insurance=?,PhoneNumber=?,HospitalAssignedID=(SELECT HospitalID FROM Hospitals WHERE HospitalName=?),OptimalCost=? WHERE PatientID=?";
    int age = patient.age, id = patient.id; double cost = patient.optimalCost;
    std::string nameStr(patient.name);
    std::string bloodStr(patient.bloodGroup);
    std::string vaccinesStr(1, patient.vaccinesDone ? patient.vaccinesDone : 'U');
    std::string areaStr(patient.areaOfTreatment);
    std::string insuranceStr(patient.insurance);
    std::string phoneStr(patient.phoneNumber);
    std::string hospitalStr(patient.hospitalAssigned);

    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(query)), SQL_NTS))
        && bindText(statement, 1, nameStr) && bindInt(statement, 2, age) && bindText(statement, 3, bloodStr)
        && bindText(statement, 4, vaccinesStr) && bindText(statement, 5, areaStr)
        && bindText(statement, 6, insuranceStr) && bindText(statement, 7, phoneStr)
        && bindText(statement, 8, hospitalStr) && bindDouble(statement, 9, cost) && bindInt(statement, 10, id)
        && execute(statement, "updating patient");
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    return ok;
}

float DatabaseRepository::getPatientNumericParameter(int patientId, const std::string& parameter) {
    const std::string column = numericColumn(parameter);
    if (column.empty()) return -1.0f;
    SQLHSTMT statement = SQL_NULL_HSTMT; double value = -1.0; SQLLEN indicator = 0;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return -1.0f;
    const std::string query = "SELECT " + column + " FROM Patients WHERE PatientID=?";
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(query.c_str())), SQL_NTS)) && bindInt(statement, 1, patientId) && execute(statement, "getting patient parameter");
    if (ok && SQLFetch(statement) == SQL_SUCCESS) SQLGetData(statement, 1, SQL_C_DOUBLE, &value, 0, &indicator);
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    return ok ? static_cast<float>(value) : -1.0f;
}

bool DatabaseRepository::updatePatientNumericParameter(int patientId, const std::string& parameter, double value) {
    const std::string column = numericColumn(parameter);
    if (column.empty()) return false;
    SQLHSTMT statement = SQL_NULL_HSTMT;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    const std::string query = "UPDATE Patients SET " + column + "=? WHERE PatientID=?";
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(query.c_str())), SQL_NTS)) && bindDouble(statement, 1, value) && bindInt(statement, 2, patientId) && execute(statement, "updating patient parameter");
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    return ok;
}

bool DatabaseRepository::updatePatientStringParameter(int patientId, const std::string& parameter,
                                                       const std::string& value) {
    const std::string column = stringColumn(parameter);
    if (column.empty()) return false;
    SQLHSTMT statement = SQL_NULL_HSTMT;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    const std::string query = "UPDATE Patients SET " + column + "=? WHERE PatientID=?";
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(query.c_str())), SQL_NTS))
        && bindText(statement, 1, value) && bindInt(statement, 2, patientId)
        && execute(statement, "updating patient string parameter");
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    return ok;
}

bool DatabaseRepository::getPatientStatistics(PatientStatistics& statistics) {
    SQLHSTMT statement = SQL_NULL_HSTMT; SQLLEN indicator = 0;
    if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    const char* query = "SELECT COUNT(*),SUM(CASE WHEN UPPER(VaccinesDone)='Y' THEN 1 ELSE 0 END),SUM(CASE WHEN LOWER(Insurance)='yes' THEN 1 ELSE 0 END),COALESCE(AVG(CAST(OptimalCost AS FLOAT)),0) FROM Patients";
    bool ok = succeeded(SQLExecDirectA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(query)), SQL_NTS));
    if (!ok) printDiagnostics(SQL_HANDLE_STMT, statement, "getting patient statistics");
    if (ok && SQLFetch(statement) == SQL_SUCCESS) {
        SQLGetData(statement, 1, SQL_C_SLONG, &statistics.totalPatients, 0, &indicator);
        SQLGetData(statement, 2, SQL_C_SLONG, &statistics.vaccinated, 0, &indicator);
        SQLGetData(statement, 3, SQL_C_SLONG, &statistics.withInsurance, 0, &indicator);
        SQLGetData(statement, 4, SQL_C_DOUBLE, &statistics.averageOptimalCost, 0, &indicator);
    } else ok = false;
    SQLFreeHandle(SQL_HANDLE_STMT, statement);
    return ok;
}

int DatabaseRepository::getAmbulances(Ambulance ambulances[], int maxAmbulances) {
    SQLHSTMT statement = SQL_NULL_HSTMT; if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return 0;
    bool ok = succeeded(SQLExecDirectA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>("SELECT AmbulanceID,CurrentHospitalID,Status,Fuel FROM Ambulances ORDER BY AmbulanceID")), SQL_NTS));
    if (!ok) printDiagnostics(SQL_HANDLE_STMT, statement, "loading ambulances");
    int count = 0; SQLLEN indicator = 0;
    while (ok && count < maxAmbulances && SQLFetch(statement) == SQL_SUCCESS) {
        ambulances[count] = Ambulance{};
        SQLGetData(statement, 1, SQL_C_SLONG, &ambulances[count].id, 0, &indicator);
        SQLGetData(statement, 2, SQL_C_SLONG, &ambulances[count].location, 0, &indicator);
        SQLGetData(statement, 3, SQL_C_CHAR, ambulances[count].status, sizeof(ambulances[count].status), &indicator);
        SQLGetData(statement, 4, SQL_C_SLONG, &ambulances[count].fuel, 0, &indicator); ++count;
    }
    SQLFreeHandle(SQL_HANDLE_STMT, statement); return ok ? count : 0;
}

bool DatabaseRepository::getAmbulanceById(int ambulanceId, Ambulance& ambulance) {
    SQLHSTMT statement = SQL_NULL_HSTMT; if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    int id = ambulanceId; bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>("SELECT AmbulanceID,CurrentHospitalID,Status,Fuel FROM Ambulances WHERE AmbulanceID=?")), SQL_NTS)) && bindInt(statement, 1, id) && execute(statement, "getting ambulance");
    SQLLEN indicator = 0;
    if (ok && SQLFetch(statement) == SQL_SUCCESS) {
        ambulance = Ambulance{}; SQLGetData(statement, 1, SQL_C_SLONG, &ambulance.id, 0, &indicator); SQLGetData(statement, 2, SQL_C_SLONG, &ambulance.location, 0, &indicator); SQLGetData(statement, 3, SQL_C_CHAR, ambulance.status, sizeof(ambulance.status), &indicator); SQLGetData(statement, 4, SQL_C_SLONG, &ambulance.fuel, 0, &indicator);
    } else ok = false;
    SQLFreeHandle(SQL_HANDLE_STMT, statement); return ok;
}

bool DatabaseRepository::updateAmbulance(int ambulanceId, int hospitalId, const std::string& status, int fuel) {
    SQLHSTMT statement = SQL_NULL_HSTMT; if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>("UPDATE Ambulances SET CurrentHospitalID=?,Status=?,Fuel=? WHERE AmbulanceID=?")), SQL_NTS)) && bindInt(statement, 1, hospitalId) && bindText(statement, 2, status) && bindInt(statement, 3, fuel) && bindInt(statement, 4, ambulanceId) && execute(statement, "updating ambulance");
    SQLFreeHandle(SQL_HANDLE_STMT, statement); return ok;
}

bool DatabaseRepository::addTimelineEvent(int ambulanceId, const std::string& eventType, const std::string& message) { return addTimelineEventAt(ambulanceId, eventType, message, ""); }

bool DatabaseRepository::addTimelineEventAt(int ambulanceId, const std::string& eventType, const std::string& message, const std::string& timestamp) {
    SQLHSTMT statement = SQL_NULL_HSTMT; if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    const char* query = timestamp.empty() ? "INSERT INTO AmbulanceTimeline (AmbulanceID,EventTime,EventType,Message) VALUES (?,SYSDATETIME(),?,?)" : "INSERT INTO AmbulanceTimeline (AmbulanceID,EventTime,EventType,Message) VALUES (?,CONVERT(datetime2,?,120),?,?)";
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>(query)), SQL_NTS)) && bindInt(statement, 1, ambulanceId);
    if (ok && !timestamp.empty()) ok = bindText(statement, 2, timestamp) && bindText(statement, 3, eventType) && bindText(statement, 4, message);
    else if (ok) ok = bindText(statement, 2, eventType) && bindText(statement, 3, message);
    if (ok) ok = execute(statement, "adding ambulance timeline event");
    SQLFreeHandle(SQL_HANDLE_STMT, statement); return ok;
}

bool DatabaseRepository::dispatchAmbulance(int ambulanceId, int hospitalId, const std::string& status,
                                           int fuel, const std::string& eventType, const std::string& message) {
    if (!beginTransaction()) return false;
    bool ok = updateAmbulance(ambulanceId, hospitalId, status, fuel) && addTimelineEvent(ambulanceId, eventType, message);
    return finishTransaction(ok) && ok;
}

bool DatabaseRepository::addHospitalFeedback(int hospitalId, int rating, const std::string& feedback) {
    SQLHSTMT statement = SQL_NULL_HSTMT; if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>("INSERT INTO HospitalFeedback (HospitalID,Rating,FeedbackText,CreatedAt) VALUES (?,?,?,SYSDATETIME())")), SQL_NTS)) && bindInt(statement, 1, hospitalId) && bindInt(statement, 2, rating) && bindText(statement, 3, feedback) && execute(statement, "adding hospital feedback");
    SQLFreeHandle(SQL_HANDLE_STMT, statement); return ok;
}

bool DatabaseRepository::getHospitalFeedback(int hospitalId, std::vector<FeedbackEntry>& feedback) {
    feedback.clear(); SQLHSTMT statement = SQL_NULL_HSTMT; if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return false;
    int id = hospitalId; bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>("SELECT Rating,FeedbackText FROM HospitalFeedback WHERE HospitalID=? ORDER BY FeedbackID")), SQL_NTS)) && bindInt(statement, 1, id) && execute(statement, "getting hospital feedback");
    SQLLEN indicator = 0;
    while (ok && SQLFetch(statement) == SQL_SUCCESS) { FeedbackEntry entry{}; SQLGetData(statement, 1, SQL_C_SLONG, &entry.rating, 0, &indicator); SQLGetData(statement, 2, SQL_C_CHAR, entry.feedback, sizeof(entry.feedback), &indicator); feedback.push_back(entry); }
    SQLFreeHandle(SQL_HANDLE_STMT, statement); return ok;
}

double DatabaseRepository::getAverageHospitalFeedbackRating(int hospitalId) {
    SQLHSTMT statement = SQL_NULL_HSTMT; if (!succeeded(SQLAllocHandle(SQL_HANDLE_STMT, connection_, &statement))) return 0.0;
    int id = hospitalId; double rating = 0.0; SQLLEN indicator = 0;
    bool ok = succeeded(SQLPrepareA(statement, reinterpret_cast<SQLCHAR*>(const_cast<char*>("SELECT COALESCE(AVG(CAST(Rating AS DECIMAL(5,2))),0) FROM HospitalFeedback WHERE HospitalID=?")), SQL_NTS)) && bindInt(statement, 1, id) && execute(statement, "calculating average feedback rating");
    if (ok && SQLFetch(statement) == SQL_SUCCESS) SQLGetData(statement, 1, SQL_C_DOUBLE, &rating, 0, &indicator); else ok = false;
    SQLFreeHandle(SQL_HANDLE_STMT, statement); return ok ? rating : 0.0;
}
