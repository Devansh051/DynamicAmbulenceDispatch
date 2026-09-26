// One-time importer for the legacy text files. The normal application never reads them.
#include "database_repository.h"

#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <regex>
#include <string>

namespace {
std::string trim(std::string value) {
    const std::size_t start = value.find_first_not_of(" \t\r\n");
    const std::size_t end = value.find_last_not_of(" \t\r\n");
    return start == std::string::npos ? "" : value.substr(start, end - start + 1);
}


void setText(char* destination, std::size_t size, const std::string& value) {
    std::strncpy(destination, value.c_str(), size - 1);
    destination[size - 1] = '\0';
}

int hospitalId(const std::string& value) {
    int id = 0;
    std::sscanf(value.c_str(), "%d.", &id);
    return id >= 1 && id <= HOSPITAL_COUNT ? id : 0;
}

int importPatients(DatabaseRepository& repository, const char* filename) {
    std::ifstream file(filename);
    if (!file) { std::cerr << "Cannot open " << filename << '\n'; return 0; }
    int imported = 0;
    Patient patient{};
    int assignedHospital = 0;
    std::string line;
    auto save = [&]() {
        if (patient.id == 0) return;
        if (assignedHospital == 0) {
            std::cerr << "Skipping patient " << patient.id << ": invalid hospital assignment.\n";
        } else if (!repository.patientExists(patient.id) && repository.insertPatient(patient, assignedHospital)) {
            ++imported;
        }
        patient = Patient{};
        assignedHospital = 0;
    };
    while (std::getline(file, line)) {
        if (line.find("-----------------") == 0) { save(); continue; }
        const std::size_t separator = line.find(':');
        if (separator == std::string::npos) continue;
        const std::string key = trim(line.substr(0, separator));
        const std::string value = trim(line.substr(separator + 1));
        if (key == "Patient ID") patient.id = std::atoi(value.c_str());
        else if (key == "Name") setText(patient.name, sizeof(patient.name), value);
        else if (key == "Age") patient.age = std::atoi(value.c_str());
        else if (key == "Blood Group") setText(patient.bloodGroup, sizeof(patient.bloodGroup), value);
        else if (key == "Vaccines Done") patient.vaccinesDone = value.empty() ? 'U' : value[0];
        else if (key == "Area of Treatment") setText(patient.areaOfTreatment, sizeof(patient.areaOfTreatment), value);
        else if (key == "Insurance") setText(patient.insurance, sizeof(patient.insurance), value);
        else if (key == "Phone Number") setText(patient.phoneNumber, sizeof(patient.phoneNumber), value);
        else if (key == "Hospital Assigned") { setText(patient.hospitalAssigned, sizeof(patient.hospitalAssigned), value); assignedHospital = hospitalId(value); }
        else if (key == "Optimal Cost") std::sscanf(value.c_str(), "%lf", &patient.optimalCost);
        else if (key == "Severity") std::sscanf(value.c_str(), "%f", &patient.severity);
        else if (key == "Current_Treatment_Cost(INR)") std::sscanf(value.c_str(), "%f", &patient.current_treatment_cost);
        else if (key == "Total_expenditure(INR)") std::sscanf(value.c_str(), "%f", &patient.total_expenditure);
    }
    save();
    return imported;
}

int importAmbulances(DatabaseRepository& repository, const char* filename) {
    std::ifstream file(filename); if (!file) { std::cerr << "Cannot open " << filename << '\n'; return 0; }
    int imported = 0, id = 0, location = 0, fuel = 0; char status[16]{}; std::string line;
    while (std::getline(file, line)) {
        if (std::sscanf(line.c_str(), "%d,%d,%15[^,],%d", &id, &location, status, &fuel) == 4 &&
            repository.updateAmbulance(id, location, status, fuel)) ++imported;
    }
    return imported;
}

int importFeedback(DatabaseRepository& repository, const char* filename) {
    std::ifstream file(filename); if (!file) { std::cerr << "Cannot open " << filename << '\n'; return 0; }
    int imported = 0, currentHospital = 0, rating = 0; std::string line;
    while (std::getline(file, line)) {
        if (hospitalId(line) != 0) currentHospital = hospitalId(line);
        else if (std::sscanf(line.c_str(), "Rating: %d", &rating) == 1) continue;
        else if (line.find("Feedback:") == 0 && currentHospital && rating) {
            std::string text = trim(line.substr(std::strlen("Feedback:")));
            if (text.size() >= 2 && text.front() == '"' && text.back() == '"') text = text.substr(1, text.size() - 2);
            if (repository.addHospitalFeedback(currentHospital, rating, text)) ++imported;
            rating = 0;
        }
    }
    return imported;
}

int importTimeline(DatabaseRepository& repository, const char* filename) {
    std::ifstream file(filename); if (!file) { std::cerr << "Cannot open " << filename << '\n'; return 0; }
    const std::regex entry(R"(^\[([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})\] (.*)$)");
    std::smatch match; std::string line; int imported = 0;
    while (std::getline(file, line)) {
        if (!std::regex_match(line, match, entry)) continue;
        int ambulance = 0;
        if (std::sscanf(match[2].str().c_str(), "Ambulance %d", &ambulance) != 1)
            std::sscanf(match[2].str().c_str(), "%*[^A]Ambulance %d", &ambulance);
        if (ambulance > 0 && repository.addTimelineEventAt(ambulance, "LegacyImport", match[2].str(), match[1].str())) ++imported;
    }
    return imported;
}
}

int main() {
    DatabaseRepository& repository = database();
    if (!repository.connectFromEnvironment()) return 1;
    std::cout << "Imported patients: " << importPatients(repository, "patient_details.txt") << '\n';
    std::cout << "Imported ambulance states: " << importAmbulances(repository, "ambulance_locations.txt") << '\n';
    std::cout << "Imported feedback entries: " << importFeedback(repository, "hospital_feedback.txt") << '\n';
    std::cout << "Imported timeline events: " << importTimeline(repository, "ambulance_timeline.txt") << '\n';
}
