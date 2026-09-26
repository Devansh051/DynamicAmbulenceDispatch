#pragma once

#include "model_types.h"

#ifdef _WIN32
#include <windows.h>
#endif
#include <sqltypes.h>
#include <sql.h>
#include <sqlext.h>

#include <string>
#include <vector>

class DatabaseRepository {
public:
    DatabaseRepository();
    ~DatabaseRepository();
    DatabaseRepository(const DatabaseRepository&) = delete;
    DatabaseRepository& operator=(const DatabaseRepository&) = delete;

    bool connectFromEnvironment();
    void disconnect();
    bool isConnected() const;

    bool loadHospitalData(int matrix[HOSPITAL_COUNT][HOSPITAL_COUNT],
                          int casualties[HOSPITAL_COUNT][HOSPITAL_COUNT],
                          int weights[HOSPITAL_COUNT][HOSPITAL_COUNT],
                          char hospitalNames[HOSPITAL_COUNT][50]);

    bool patientExists(int patientId);
    bool getPatientById(int patientId, Patient& patient);
    bool insertPatient(const Patient& patient, int hospitalAssignedId);
    bool updatePatient(const Patient& patient);
    float getPatientNumericParameter(int patientId, const std::string& parameter);
    bool updatePatientNumericParameter(int patientId, const std::string& parameter, double value);
    bool updatePatientStringParameter(int patientId, const std::string& parameter, const std::string& value);
    bool getPatientStatistics(PatientStatistics& statistics);

    int getAmbulances(Ambulance ambulances[], int maxAmbulances);
    bool getAmbulanceById(int ambulanceId, Ambulance& ambulance);
    bool updateAmbulance(int ambulanceId, int hospitalId, const std::string& status, int fuel);
    bool dispatchAmbulance(int ambulanceId, int hospitalId, const std::string& status,
                           int fuel, const std::string& eventType, const std::string& message);
    bool addTimelineEvent(int ambulanceId, const std::string& eventType, const std::string& message);
    bool addTimelineEventAt(int ambulanceId, const std::string& eventType,
                            const std::string& message, const std::string& timestamp);

    bool addHospitalFeedback(int hospitalId, int rating, const std::string& feedback);
    bool getHospitalFeedback(int hospitalId, std::vector<FeedbackEntry>& feedback);
    double getAverageHospitalFeedbackRating(int hospitalId);

private:
    SQLHENV environment_;
    SQLHDBC connection_;

    bool execute(SQLHSTMT statement, const char* context);
    bool beginTransaction();
    bool finishTransaction(bool commit);
    void printDiagnostics(SQLSMALLINT handleType, SQLHANDLE handle, const char* context) const;
    static bool copyTo(char* target, std::size_t targetSize, const char* source);
};

// Existing functions keep their signatures and use this single repository instance.
DatabaseRepository& database();
