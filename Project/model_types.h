#pragma once

#include <cstddef>

constexpr int HOSPITAL_COUNT = 15;
constexpr int MAX_PHONE_NUMBER_LEN = 15;

struct Patient {
    int id{};
    char name[50]{};
    int age{};
    char bloodGroup[5]{};
    char gender{};
    char address[100]{};
    char condition[100]{};
    char vaccinesDone{};
    char areaOfTreatment[50]{};
    char insurance[5]{};
    char phoneNumber[MAX_PHONE_NUMBER_LEN]{};
    char hospitalAssigned[50]{};
    double optimalCost{};
    float severity{};
    float current_treatment_cost{};
    float total_expenditure{};
};

struct Ambulance {
    int id{};
    int location{}; // 1-based hospital index
    char status[16]{};
    int fuel{};
};

struct PatientStatistics {
    int totalPatients{};
    int vaccinated{};
    int withInsurance{};
    double averageOptimalCost{};
};

struct FeedbackEntry {
    int rating{};
    char feedback[501]{};
};
