#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <cstdlib>
#include <ctime>
#include <climits>
#include <cstring>
#include <cctype>
#include <cstdio>
#include <chrono>
#include <thread>
#include <algorithm>

#include "database_repository.h"

using namespace std;

// Helper: confirms the OTP
bool confirmOTP() {
    srand((unsigned int)time(nullptr));
    int otp = rand() % 900000 + 100000; // 6-digit OTP
    int userInput;
    cout << "\n=== OTP Confirmation ===" << endl;
    cout << "Your OTP is: " << otp << endl;
    cout << "Please enter the OTP to confirm dispatch: ";
    if (!(cin >> userInput)) {
        cout << "Invalid input." << endl;
        cin.clear();
        cin.ignore(10000, '\n');
        return false;
    }
    if (userInput == otp) {
        cout << "OTP confirmed. Proceeding with dispatch." << endl;
        return true;
    } else {
        cout << "Incorrect OTP. Dispatch cancelled." << endl;
        return false;
    }
}

#define AMBULANCE_BUSY_TIME 5
#define MAX_LINE 1000
#define MAX_PATIENTS 100
#define MAX_FIELD_LEN 100
#define MIN_FUEL_THRESHOLD 20   // Minimum fuel percentage required for dispatch
#define REFUEL_TIME_MS 3000     // Time taken to refuel (3 seconds)

static char current_patient[10]; // Global variable to store current patient ID

// Function to get a specific patient parameter by ID
float get_patient_param(const char* patient_id, const char* param) {
    return database().getPatientNumericParameter(atoi(patient_id), param);
}

// Function to set a specific patient parameter by ID
int set_patient_param(const char* patient_id, const char* param, float new_value) {
    return database().updatePatientNumericParameter(atoi(patient_id), param, new_value) ? 1 : 0;
}

struct Node {
    char hospital_name[50];
    int casualtiesPresent;
    int weight;
    Node *link;
};

// Function to insert a node at the rear of the linked list
Node* insert_rear(char hospital_name[], int casualties, int weight, Node* first) {
    Node* temp = new Node;
    strcpy(temp->hospital_name, hospital_name);
    temp->casualtiesPresent = casualties;
    temp->weight = weight;
    temp->link = nullptr;

    if (first == nullptr) {
        return temp;
    }

    Node* cur = first;
    while (cur->link != nullptr) {
        cur = cur->link;
    }

    cur->link = temp;
    return first;
}

// Function to display the linked list
void display(Node* first) {
    if (first == nullptr) {
        cout << "  No connected hospitals found." << endl;
        return;
    }
    Node* cur = first;
    while (cur != nullptr) {
        cout << cur->hospital_name << " (Casualties: " << cur->casualtiesPresent
             << ", Road Weight: " << cur->weight << ")";
        if (cur->link != nullptr)
            cout << " -> ";
        cur = cur->link;
    }
    cout << endl;
}

// Function to create an adjacency list from matrices
Node** createAdjacencyList(int hospitals, int matrix[15][15], int casualtiesMatrix[15][15], int weights[15][15], char hospital_names[15][50]) {
    Node** adjList = new Node*[hospitals];

    for (int i = 0; i < hospitals; i++) {
        adjList[i] = nullptr;
        for (int j = 0; j < hospitals; j++) {
            if (matrix[i][j] != 0) {
                adjList[i] = insert_rear(hospital_names[j], casualtiesMatrix[i][j], weights[i][j], adjList[i]);
            }
        }
    }

    return adjList;
}

// Update the displayAdjacencyList call
void displayAdjacencyList(Node** adjList, int hospitals, char hospital_names[15][50]) {
    cout << "Displaying the adjacency lists for all hospitals:" << endl << endl;
    for (int i = 0; i < hospitals; i++) {
        cout << "Hospital: " << hospital_names[i] << endl;
        cout << "Connected Hospitals / Neighbors:" << endl;
        display(adjList[i]);
        cout << "------------------------------" << endl << endl;
    }
    cout << "End of adjacency lists." << endl;
}

// Function to print hospital names using hospital numbers
void printHospitalName(int hospitalNumber, char hospital_names[15][50]) {
    if (hospitalNumber >= 0 && hospitalNumber < 15) {
        cout << "Hospital " << hospitalNumber << ": " << hospital_names[hospitalNumber - 1] << endl;
    } else {
        cout << "Invalid hospital number." << endl;
    }
}

// Function to find the shortest path using Floyd-Warshall algorithm
void findShortestPath(int hospitals, int weights[15][15], int src, int dest, char hospital_names[15][50]) {
    // Implement Floyd-Warshall algorithm
    for (int k = 0; k < hospitals; k++) {
        for (int i = 0; i < hospitals; i++) {
            for (int j = 0; j < hospitals; j++) {
                if (weights[i][k] + weights[k][j] < weights[i][j]) {
                    weights[i][j] = weights[i][k] + weights[k][j];
                }
            }
        }
    }

    // Print the shortest path
    cout << "Shortest path from " << hospital_names[src] << " to " << hospital_names[dest] << ": " << weights[src][dest] << endl;
}

// Function to print admission difficulty based on casualties
void printAdmissionDifficulty(int casualties) {
    if (casualties >= 40) {
        cout << "It is very difficult to get admitted. It is better if you try another hospital..." << endl;
    } else if (casualties >= 30 && casualties < 40) {
        cout << "You may get admitted but may have to wait..." << endl;
    } else if (casualties < 30) {
        cout << "You may get admitted easily..." << endl;
    } else {
        cout << "Invalid casualty value." << endl;
    }
}

// Function to check if a patient ID already exists
bool isPatientIdExist(int patientId) {
    return database().patientExists(patientId);
}

// Function to handle patient details
bool isValidBloodGroup(const char *bg) {
    const char *valid[] = {"A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"};
    for (int i = 0; i < 8; i++) {
        if (strcmp(bg, valid[i]) == 0)
            return true;
    }
    return false;
}

bool handlePatientDetails(int src, int nearestHospital, int averageWeight, char hospital_names[15][50], int moneyFactor, int severity) {
    char name[50], bloodGroup[5], insurance[5], areaOfTreatment[50];
    int age, patientId;
    long long phoneNumber;
    char vaccinesDone;

    // Patient ID
    while (true) {
        cout << "Enter unique 4-digit Patient ID: ";
        cin >> patientId;
        if (patientId >= 1000 && patientId <= 9999 && !isPatientIdExist(patientId))
            break;
        if (patientId < 1000 || patientId > 9999) {
            cout << "Invalid Patient ID. Must be a 4-digit number." << endl;
        } else {
            cout << "Patient already exists. Proceeding with hospital assignment..." << endl;
            sprintf(current_patient, "%d", patientId);
            return true;
        }
    }

    // Name
    while (true) {
        cout << "Name: ";
        cin >> name;
        if (isalpha(name[0]))
            break;
        cout << "Invalid name. Must start with a letter." << endl;
    }

    // Age
    while (true) {
        cout << "Age: ";
        cin >> age;
        if (age > 0 && age <= 120)
            break;
        cout << "Age must be between 1 and 120." << endl;
    }

    // Blood Group
    while (true) {
        cout << "Blood Group (e.g., A+): ";
        cin >> bloodGroup;
        if (isValidBloodGroup(bloodGroup))
            break;
        cout << "Invalid blood group." << endl;
    }

    // Vaccination
    while (true) {
        cout << "Have you received both doses of the COVID-19 vaccine? (y/n): ";
        cin >> vaccinesDone;
        if (vaccinesDone == 'y' || vaccinesDone == 'n')
            break;
        cout << "Enter 'y' or 'n' only." << endl;
    }

    // Area of Treatment
    while (true) {
        cout << "Area of Treatment required: ";
        cin >> areaOfTreatment;
        if (strlen(areaOfTreatment) > 0)
            break;
        cout << "Area of treatment cannot be empty." << endl;
    }

    // Insurance
    while (true) {
        cout << "Insurance? (yes/no): ";
        cin >> insurance;
        if (strcmp(insurance, "yes") == 0 || strcmp(insurance, "no") == 0)
            break;
        cout << "Please enter 'yes' or 'no'." << endl;
    }

    // Phone Number
    while (true) {
        cout << "Phone Number: ";
        cin >> phoneNumber;
        if (phoneNumber >= 1000000000LL && phoneNumber <= 9999999999LL)
            break;
        cout << "Phone number must be 10 digits." << endl;
    }

    // OTP confirmation before writing patient details
    if (!confirmOTP()) {
        cout << "Patient dispatch aborted due to OTP failure." << endl;
        return false;
    }

    Patient patient{};
    patient.id = patientId;
    strncpy(patient.name, name, sizeof(patient.name) - 1);
    patient.age = age;
    strncpy(patient.bloodGroup, bloodGroup, sizeof(patient.bloodGroup) - 1);
    patient.vaccinesDone = toupper(vaccinesDone);
    strncpy(patient.areaOfTreatment, areaOfTreatment, sizeof(patient.areaOfTreatment) - 1);
    strncpy(patient.insurance, insurance, sizeof(patient.insurance) - 1);
    snprintf(patient.phoneNumber, sizeof(patient.phoneNumber), "%lld", phoneNumber);
    strncpy(patient.hospitalAssigned, hospital_names[nearestHospital - 1], sizeof(patient.hospitalAssigned) - 1);
    patient.optimalCost = static_cast<double>(averageWeight) * moneyFactor;
    patient.severity = static_cast<float>(severity);
    patient.current_treatment_cost = static_cast<float>(static_cast<double>(averageWeight) * moneyFactor *
        (severity == 5 ? 2.0 : (severity == 4 ? 1.5 : (severity == 3 ? 1.2 : (severity == 2 ? 1.0 : 0.8)))));
    patient.total_expenditure = patient.current_treatment_cost;

    if (!database().insertPatient(patient, nearestHospital)) {
        cout << "Error saving patient details to SQL Server." << endl;
        return false;
    }
    cout << "Patient details successfully recorded." << endl << endl;
    return true;
}

// Simulate ambulance movement with progress bar
void simulateAmbulanceMovement(const char *srcName, const char *destName, int steps, int delayMs) {
    cout << "\nAmbulance is moving from " << srcName << " to " << destName << "..." << endl;
    cout << "[                                                  ] 0%";
    cout.flush();
    for (int i = 1; i <= steps; ++i) {
        this_thread::sleep_for(chrono::milliseconds(delayMs));
        int progress = (i * 50) / steps; // 50 chars wide
        cout << "\r[";
        for (int j = 0; j < 50; ++j) {
            if (j < progress)
                cout << "#";
            else
                cout << " ";
        }
        cout << "] " << (i * 100) / steps << "%";
        cout.flush();
    }
    cout << "\nAmbulance has arrived at " << destName << "!" << endl << endl;
}

#define MAX_AMBULANCES 20

// Forward declarations
void refuelAmbulance(Ambulance *ambulance);
void updateAmbulanceStatus(int ambId, int newLocation, const char *newStatus, int newFuel);
void displayAllAmbulances(Ambulance ambulances[], int ambCount, char hospital_names[15][50], int src, int weights[15][15]);
int readAmbulances(Ambulance ambulances[], int maxAmb);
int findNearestAmbulance(Ambulance ambulances[], int ambCount, int src, int weights[15][15]);
void displayDispatchTimestamp(const char* event);


int readAmbulances(Ambulance ambulances[], int maxAmb) {
    return database().getAmbulances(ambulances, maxAmb);
}

// Find nearest available ambulance to a given hospital
int findNearestAmbulance(Ambulance ambulances[], int ambCount, int src, int weights[15][15]) {
    int minDist = INT_MAX, ambIdx = -1;
    for (int i = 0; i < ambCount; ++i) {
        if (strcmp(ambulances[i].status, "available") != 0 ||
            ambulances[i].fuel < MIN_FUEL_THRESHOLD)
            continue;
        int dist = weights[ambulances[i].location - 1][src - 1];
        if (dist > 0 && dist < minDist) {
            minDist = dist;
            ambIdx = i;
        }
    }

    if (ambIdx != -1 && ambulances[ambIdx].fuel < MIN_FUEL_THRESHOLD * 2) {
        // If fuel is low but above minimum threshold, refuel before dispatch
        refuelAmbulance(&ambulances[ambIdx]);
        updateAmbulanceStatus(ambulances[ambIdx].id, ambulances[ambIdx].location,
                              "available", 100);
    }

    return ambIdx;
}

void updateAmbulanceStatus(int ambId, int newLocation, const char *newStatus, int newFuel) {
    char message[160];
    snprintf(message, sizeof(message), "Ambulance %d status changed to %s at hospital %d", ambId, newStatus, newLocation);
    if (!database().dispatchAmbulance(ambId, newLocation, newStatus, newFuel, "StatusUpdate", message))
        cout << "Warning: Could not update ambulance in SQL Server." << endl;
}

// Display all ambulances and their locations, status, and estimated time to src
void displayAllAmbulances(Ambulance ambulances[], int ambCount, char hospital_names[15][50], int src, int weights[15][15]) {
    cout << "\nAmbulance Status List (all ambulances):" << endl;
    int count = 0;
    for (int i = 0; i < ambCount; ++i) {
        int delay = weights[ambulances[i].location - 1][src - 1];
        cout << "  Ambulance " << ambulances[i].id << " at " << hospital_names[ambulances[i].location - 1]
             << " | Status: " << ambulances[i].status
             << " | Fuel: " << ambulances[i].fuel << "% | ";

        if (ambulances[i].location == src) {
            cout << "Already at emergency location (0 seconds to reach)" << endl;
        } else if (delay >= 0 && delay < 10000) {
            cout << "Estimated time to reach emergency: " << delay << " seconds" << endl;
        } else {
            cout << "Cannot reach emergency location directly" << endl;
        }
        count++;
    }
    cout << "Total ambulances: " << count << endl;
}

Patient* searchPatientById(int id) {
    Patient* patient = new Patient{};
    if (!database().getPatientById(id, *patient)) {
        delete patient;
        return nullptr;
    }
    return patient;
}

// Function to update patient records
bool updatePatientRecord(Patient *patient) {
    return patient != nullptr && database().updatePatient(*patient);
}

// Function to generate statistics
void generatePatientStatistics() {
    PatientStatistics statistics{};
    if (!database().getPatientStatistics(statistics)) return;

    cout << "\n=== Patient Statistics ===" << endl;
    cout << "Total Patients: " << statistics.totalPatients << endl;
    printf("Vaccinated Patients: %d (%.1f%%)\n", statistics.vaccinated,
           statistics.totalPatients > 0 ? (statistics.vaccinated * 100.0 / statistics.totalPatients) : 0.0);
    printf("Patients with Insurance: %d (%.1f%%)\n", statistics.withInsurance,
           statistics.totalPatients > 0 ? (statistics.withInsurance * 100.0 / statistics.totalPatients) : 0.0);
    printf("Average Cost per Patient: %.2f INR\n",
           statistics.averageOptimalCost);
    cout << "=======================" << endl;
}

void clear_input_buffer() {
    cin.clear();
    cin.ignore(10000, '\n');
}

double calculateHospitalScore(int distance, int rating) {
    return distance - (rating * 0.5);
}

void saveFeedback(int hospitalNum, const char *feedback, int rating, char hospital_names[][50]) {
    (void)hospital_names;
    if (!database().addHospitalFeedback(hospitalNum, rating, feedback))
        cout << "Error saving feedback to SQL Server." << endl;
}

void displayHospitalFeedback(int hospitalNum, char hospital_names[][50]) {
    cout << "\n=== Feedback for " << hospital_names[hospitalNum - 1] << " ===" << endl;
    vector<FeedbackEntry> feedback;
    if (!database().getHospitalFeedback(hospitalNum, feedback) || feedback.empty()) {
        cout << "Status: Not Rated" << endl;
        cout << "No feedback available yet." << endl;
    } else {
        for (size_t i = 0; i < feedback.size(); ++i) {
            cout << "\nFeedback #" << i + 1 << ":" << endl;
            cout << "Rating: " << feedback[i].rating << " stars" << endl;
            cout << "Feedback: \"" << feedback[i].feedback << "\"" << endl;
        }
        double averageRating = database().getAverageHospitalFeedbackRating(hospitalNum);
        printf("\nAverage Rating: %.1f stars\n", averageRating);
        cout << "Total Feedback Entries: " << feedback.size() << endl;
    }
    cout << "================================" << endl;
}

double calculateAverageFeedbackRating(int hospitalNum, char hospital_names[][50]) {
    (void)hospital_names;
    return database().getAverageHospitalFeedbackRating(hospitalNum);
}

void refuelAmbulance(Ambulance *ambulance) {
    char refuelMsg[200];
    printf("\nAmbulance %d fuel low (%d%%). Sending to refuel station...\n",
           ambulance->id, ambulance->fuel);
    sprintf(refuelMsg, "Ambulance %d starting refuel process (Current fuel: %d%%)",
            ambulance->id, ambulance->fuel);
    displayDispatchTimestamp(refuelMsg);
    cout << "[                                                  ] 0%";
    cout.flush();

    for (int i = 1; i <= 50; ++i) {
        this_thread::sleep_for(chrono::milliseconds(REFUEL_TIME_MS / 50));
        cout << "\r[";
        for (int j = 0; j < 50; ++j) {
            cout << (j < i ? "#" : " ");
        }
        cout << "] " << i * 2 << "%";
        cout.flush();
    }

    ambulance->fuel = 100;
    cout << "\nAmbulance " << ambulance->id << " refueled to 100%" << endl;
    sprintf(refuelMsg, "Ambulance %d refueling complete (Now at 100%%)", ambulance->id);
    displayDispatchTimestamp(refuelMsg);
}

void setAmbulanceAvailableLater(int ambId, int hospital) {
    this_thread::sleep_for(chrono::seconds(AMBULANCE_BUSY_TIME));

    // Reload from SQL Server to get the current fuel value.
    Ambulance ambulances[MAX_AMBULANCES];
    int ambCount = readAmbulances(ambulances, MAX_AMBULANCES);
    int fuel = 100; // Default if not found

    for (int i = 0; i < ambCount; ++i) {
        if (ambulances[i].id == ambId) {
            fuel = ambulances[i].fuel;
            break;
        }
    }

    updateAmbulanceStatus(ambId, hospital, "available", fuel);
    cout << "Ambulance " << ambId << " is now available at " << hospital << endl;
}

void displayDispatchTimestamp(const char* event) {
    time_t now;
    struct tm* local_time;
    char timestamp[26];

    time(&now);
    local_time = localtime(&now);
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", local_time);

    // Display to console
    cout << "\n[" << timestamp << "] " << event << endl;

    int ambulanceId = 0;
    if (sscanf(event, "Ambulance %d", &ambulanceId) != 1)
        sscanf(event, "%*[^A]Ambulance %d", &ambulanceId);
    if (!database().addTimelineEventAt(ambulanceId, "Dispatch", event, timestamp))
        cout << "Warning: Could not save timeline event to SQL Server." << endl;
}

int main() {
    int hospitals = 15;
    int choice;
    int near_hosp, src, dest;
    char input1;
    time_t currentTime;
    struct tm *localTime;
    time(&currentTime);
    localTime = localtime(&currentTime);
    cout << "\n\nDYNAMIC AMBULANCE DISPATCH SYSTEM\n" << endl;
    cout << "Hospitals and Casualties data are obtained on " << asctime(localTime) << endl;

    int matrix[15][15];
    int casualtiesMatrix[15][15];
    int weights[15][15];
    char hospital_names[15][50];
    int moneyFactor = 500;

    if (!database().connectFromEnvironment()) return 1;
    if (!database().loadHospitalData(matrix, casualtiesMatrix, weights, hospital_names)) {
        cout << "ERROR: Could not load hospital data from SQL Server." << endl;
        return 1;
    }

    Node** adjList = createAdjacencyList(hospitals, matrix, casualtiesMatrix, weights, hospital_names);

    for (;;) {
        // Validate choice input
        while (true) {
            cout << "\nEnter your choice" << endl;
            cout << "1. Finding Hospital" << endl;
            cout << "2. Print Hospital Name" << endl;
            cout << "3. Display Hospitals List" << endl;
            cout << "4. Search Patient Record" << endl;
            cout << "5. Update Patient Record" << endl;
            cout << "6. Generate Statistics" << endl;
            cout << "7. Give Feedback" << endl;
            cout << "8. Exit" << endl;

            if (cin >> choice && choice >= 1 && choice <= 8)
                break;
            cout << "Invalid choice. Please select a valid option (1-8)." << endl;
            cin.clear();
            cin.ignore(10000, '\n');
        }

        cout << endl;

        if (choice < 1 || choice > 8) {
            cout << "Invalid choice. Please select a valid option." << endl;
            continue;
        }

        switch (choice) {
        case 1:
            // Validate emergency input
            while (true) {
                cout << "Is it a case of emergency?(y/n): " << endl;
                cin >> input1;
                if (input1 == 'y' || input1 == 'n')
                    break;
                cout << "Invalid input. Please enter 'y' or 'n'." << endl;
                cin.clear();
                cin.ignore(10000, '\n');
            }

            if (input1 == 'y') {
                // Validate severity input
                int severity;

                while (true) {
                    cout << "Enter the severity of the emergency (1-5): " << endl;
                    if (cin >> severity && severity >= 1 && severity <= 5)
                        break;
                    cout << "Invalid severity. Please enter a number between 1 and 5." << endl;
                    cin.clear();
                    cin.ignore(10000, '\n');
                }

                // Validate source hospital input
                while (true) {
                    cout << "\nSelect a number corresponding to your nearest location." << endl;
                    cout << "1.Rajaji nagar  2.Sahakar Nagar  3.Sanjaynagar  4.Yeshwanthpur  5.Nagarbavi" << endl;
                    cout << "6.Bannerghatta  7.Shanti Nagar  8.Marathahalli  9.Sarjapur  10.Jayanagar" << endl;
                    cout << "11.Bommasandra  12.Whitefield  13.Krishnarajapuram  14.Yelahanka  15.Kengeri: " << endl;
                    if (cin >> src && src >= 1 && src <= hospitals)
                        break;
                    cout << "Invalid nearest location hospital number. Please enter a number between 1 and 15." << endl;
                    cin.clear();
                    cin.ignore(10000, '\n');
                }

                // Show all ambulances and their time delays BEFORE any hospital/casualty logic
                Ambulance ambulances[MAX_AMBULANCES];
                int ambCount = readAmbulances(ambulances, MAX_AMBULANCES);
                cout << "\n=== AMBULANCE LIST (before hospital selection) ===" << endl;
                displayAllAmbulances(ambulances, ambCount, hospital_names, src, weights);
                cout << "=== END OF AMBULANCE LIST ===" << endl << endl;
                cout.flush();

                cout << "\nFinding the nearest hospital possible..." << endl;

                // Traverse the adjacency list of the input hospital (src)
                Node* cur = adjList[src - 1];
                int minWeight = INT_MAX;
                int nearestHospital = -1;

                while (cur != nullptr) {
                    int currentHospitalNumber;
                    if (sscanf(cur->hospital_name, "%d", &currentHospitalNumber) == 1) {
                        if (cur->weight < minWeight) {
                            minWeight = cur->weight;
                            nearestHospital = currentHospitalNumber;
                        }
                        cout << "\nCasualty Level at Hospital " << currentHospitalNumber << ": " << cur->casualtiesPresent << " - ";
                        printAdmissionDifficulty(cur->casualtiesPresent);
                    } else {
                        cout << "\nError extracting hospital number from the name: " << cur->hospital_name << endl;
                    }

                    cur = cur->link;
                }

                // Check if there is a self-loop with a smaller weight
                if (weights[src - 1][src - 1] < minWeight) {
                    minWeight = weights[src - 1][src - 1];
                    nearestHospital = src;
                }

                int averageWeight = minWeight;
                double optimalCost = averageWeight * moneyFactor;

                // Adjust the optimal cost based on severity
                if (severity == 5) optimalCost = optimalCost * 2.0;
                else if (severity == 4) optimalCost = optimalCost * 1.5;
                else if (severity == 3) optimalCost = optimalCost * 1.2;
                else if (severity == 2) optimalCost = optimalCost * 1.0;
                else optimalCost = optimalCost * 0.8;

                if (nearestHospital != -1) {
                    // Display feedback for the nearest hospital
                    cout << "\n=== Current Feedback for " << hospital_names[nearestHospital - 1] << " ===" << endl;
                    double avgRating = calculateAverageFeedbackRating(nearestHospital, hospital_names);
                    if (avgRating > 0) {
                        printf("Average User Rating: %.1f stars\n", avgRating);
                    } else {
                        cout << "Status: Not Rated" << endl;
                    }
                    displayHospitalFeedback(nearestHospital, hospital_names);
                }
                if (nearestHospital != -1) {
                    // Show ambulance list again BEFORE dispatch
                    cout << "\n=== AMBULANCE LIST (before dispatch) ===" << endl;
                    displayAllAmbulances(ambulances, ambCount, hospital_names, src, weights);
                    cout << "=== END OF AMBULANCE LIST ===" << endl << endl;
                    cout.flush();

                    cout << "\nNearest hospital to Region " << src << " is Hospital " << hospital_names[nearestHospital - 1] << " with a road rating of " << averageWeight << endl;
                    printf("\nEffective Cost (Including severity Surcharge): %.2lf INR\n", optimalCost);

                    // Severity-based ambulance dispatch
                    if (severity >= 4) {
                        cout << "\nHIGH SEVERITY CASE (Level " << severity << ") - Dispatching ambulance immediately!" << endl;
                    } else if (severity >= 2) {
                        cout << "\nMEDIUM SEVERITY CASE (Level " << severity << ") - Dispatching ambulance." << endl;
                    } else {
                        cout << "\nLOW SEVERITY CASE (Level " << severity << ") - Non-emergency dispatch." << endl;
                    }

                    // Find and dispatch the nearest available ambulance
                    int ambIdx = findNearestAmbulance(ambulances, ambCount, src, weights);
                    if (ambIdx != -1) {
                        char dispatchMsg[200];
                        sprintf(dispatchMsg, "EMERGENCY: Dispatching Ambulance %d from %s to %s",
                                ambulances[ambIdx].id,
                                hospital_names[ambulances[ambIdx].location - 1],
                                hospital_names[src - 1]);
                        displayDispatchTimestamp(dispatchMsg);
                        simulateAmbulanceMovement(hospital_names[src - 1], hospital_names[nearestHospital - 1], 30, 80);
                        int fuelUsed = (int)(averageWeight * 0.5);
                        ambulances[ambIdx].fuel = ambulances[ambIdx].fuel - fuelUsed;
                        updateAmbulanceStatus(ambulances[ambIdx].id, nearestHospital,
                                              "busy", ambulances[ambIdx].fuel);
                        sprintf(dispatchMsg, "Ambulance %d arrived at %s",
                                ambulances[ambIdx].id,
                                hospital_names[nearestHospital - 1]);
                            (dispatchMsg);
                        cout << "Ambulance " << ambulances[ambIdx].id << " dispatched to Hospital " << hospital_names[nearestHospital - 1] << " with a delay of " << averageWeight << " seconds." << endl;
                        cout << "Remaining fuel: " << ambulances[ambIdx].fuel << "%" << endl;
                        setAmbulanceAvailableLater(ambulances[ambIdx].id, nearestHospital);
                    } else {
                        cout << "No available ambulance could be dispatched!" << endl;
                    }
                    cout.flush();

                    // Show all ambulances and their time delays AFTER dispatch
                    int ambCountAfter = readAmbulances(ambulances, MAX_AMBULANCES);
                    cout << "\n=== AMBULANCE LIST (after dispatch) ===" << endl;
                    displayAllAmbulances(ambulances, ambCountAfter, hospital_names, src, weights);
                    cout << "=== END OF AMBULANCE LIST ===" << endl << endl;
                    cout.flush();

                    if (handlePatientDetails(src, nearestHospital, averageWeight, hospital_names, moneyFactor, severity)) {
                        float totalExp;
                        totalExp = get_patient_param(current_patient, "Total_expenditure(INR)");
                        totalExp += optimalCost;
                        set_patient_param(current_patient, "Total_expenditure(INR)", totalExp);
                        set_patient_param(current_patient, "Current_Treatment_Cost(INR)", (float)optimalCost);
                        set_patient_param(current_patient, "Severity", (float)severity);
                        cout << "Patient can be admitted to the hospital." << endl << endl;
                    } else {
                        cout << "Patient can not be admitted due to invalid input." << endl << endl;
                    }
                    cout.flush();
                    break;
                } else {
                    cout << "\nNo adjacent hospitals found for Hospital " << src << endl;
                }
            } else if (input1 == 'n') {
                // Validate source hospital input
                while (true) {
                    cout << "\nSelect the number corresponding to your nearest location: " << endl;
                    cout << "1.Rajaji nagar   2.Sahakar Nagar   3.Sanjaynagar         4.Yeshwanthpur   5.Nagarbavi" << endl;
                    cout << "6.Bannerghatta   7.Shanti Nagar    8.Marathahalli        9.Sarjapur       10.Jayanagar" << endl;
                    cout << "11.Bommasandra   12.Whitefield     13.Krishnarajapuram   14.Yelahanka     15.Kengeri: " << endl;
                    if (cin >> src && src >= 1 && src <= 15)
                        break;
                    cout << "Invalid nearest location hospital number. Please enter a number between 1 and 15." << endl;
                    cin.clear();
                    cin.ignore(10000, '\n');
                }

                // Show all ambulances and their time delays BEFORE hospital selection
                Ambulance ambulances[MAX_AMBULANCES];
                int ambCount = readAmbulances(ambulances, MAX_AMBULANCES);
                cout << "\n=== AMBULANCE LIST (before hospital selection) ===" << endl;
                displayAllAmbulances(ambulances, ambCount, hospital_names, src, weights);
                cout << "=== END OF AMBULANCE LIST ===" << endl << endl;
                cout.flush();

                // Validate destination hospital input
                while (true) {
                    cout << "\nSelect the hospital you want to go: " << endl;
                    cout << "1.Suguna_Hospital(Rajajinagar)\t\t2.Aster_CMI_Hospital(Sahakarnagar)\t3.MS_Ramaiah_Hospital(Sanjaynagar)" << endl;
                    cout << "4.People's_Tree_Hospital(Yeshwanthpur) \t5.Fortis_Hospital(Nagarbhavi)\t\t6.Appolo_Hospital(Bannerghatta)" << endl;
                    cout << "7.HCG_Hospital(Shantinagar)\t\t8.Cloudnine_Hospital(Marathahalli)\t9.Columbia_Asia(Sarjapur)" << endl;
                    cout << "10.Sagar_Hospital(Jayanagar)\t\t11.Narayana_Hrudayalaya(Bommasandra)\t12.Manipal_Hospital(Whitefield)" << endl;
                    cout << "13.Koshys_Hospital(Krishnarajapuram)\t14.Sparsh_Hospital(Yelahanka)\t\t15.BGS_Gleneagles_Hospital(Kengeri)" << endl;
                    if (cin >> dest && dest >= 1 && dest <= 15)
                        break;
                    cout << "Invalid destination hospital number. Please enter a number between 1 and 15." << endl;
                    cin.clear();
                    cin.ignore(10000, '\n');
                }

                if (src == dest) {
                    cout << "\nSource and destination are the same hospital." << endl;
                    cout << "Hospital: " << hospital_names[src - 1] << endl;
                    cout << "No travel required - Cost: 0 INR" << endl << endl;

                    // Handle patient details even for same location
                    if (handlePatientDetails(src, dest, 0, hospital_names, moneyFactor, 0)) {
                        cout << "Patient can be admitted to the hospital." << endl << endl;
                    } else {
                        cout << "Patient cannot be admitted due to invalid input." << endl << endl;
                    }
                } else {
                    cout << "\nFinding the optimal route: " << endl;

                    // Initialize arrays for Dijkstra's algorithm
                    int distance[15];
                    int previous[15];
                    bool visited[15];

                    for (int i = 0; i < hospitals; i++) {
                        distance[i] = INT_MAX;
                        previous[i] = -1;
                        visited[i] = false;
                    }

                    distance[src - 1] = 0;

                    // Find the optimal route
                    for (int count = 0; count < hospitals - 1; count++) {
                        int u = -1;
                        int minDistance = INT_MAX;

                        // Select the node with the minimum distance
                        for (int v = 0; v < hospitals; v++) {
                            if (!visited[v] && distance[v] < minDistance) {
                                u = v;
                                minDistance = distance[v];
                            }
                        }

                        // Mark the selected node as visited
                        visited[u] = true;

                        // Update distances of the adjacent nodes
                        Node* cur = adjList[u];
                        while (cur != nullptr) {
                            int v = atoi(cur->hospital_name) - 1;
                            if (!visited[v] && distance[u] + cur->weight < distance[v]) {
                                distance[v] = distance[u] + cur->weight;
                                previous[v] = u;
                            }
                            cur = cur->link;
                        }
                    }

                    // Display the optimal route and average edge weight
                    cout << "\nOptimal route from " << hospital_names[src - 1] << " to " << hospital_names[dest - 1] << ": " << endl;
                    int current = dest - 1;
                    int edgeCount = 0;
                    int totalWeight = 0;
                    int route[20];
                    int routeLen = 0;
                    while (current != -1) {
                        route[routeLen++] = current;
                        int prev = previous[current];
                        if (prev != -1) {
                            totalWeight += weights[prev][current];
                            edgeCount++;
                            cout << hospital_names[current] << " <- ";
                        } else {
                            cout << hospital_names[current];
                        }
                        current = prev;
                    }
                    cout << endl;

                    // Calculate and display the average edge weight
                    if (edgeCount > 0) {
                        double averageWeight = (double)totalWeight / edgeCount;

                        // Consider alternative hospitals within 20% longer route
                        double threshold = averageWeight * 1.2;
                        int bestHospital = dest;
                        double bestScore = calculateHospitalScore(averageWeight, calculateAverageFeedbackRating(dest, hospital_names));

                        for (int alt = 0; alt < hospitals; alt++) {
                            if (alt != dest - 1) {
                                double altWeight = distance[alt];
                                if (altWeight <= threshold) {
                                    double altScore = calculateHospitalScore(altWeight, calculateAverageFeedbackRating(alt + 1, hospital_names));
                                    if (altScore < bestScore) {
                                        bestScore = altScore;
                                        bestHospital = alt + 1;
                                    }
                                }
                            }
                        }

                        if (bestHospital != dest) {
                            cout << "\nBased on distance and hospital rating:" << endl;
                            double origRating = calculateAverageFeedbackRating(dest, hospital_names);
                            double recRating = calculateAverageFeedbackRating(bestHospital, hospital_names);
                            if (origRating > 0)
                                printf("Original hospital: %s (Hospital Rating: %.1f stars)\n",
                                       hospital_names[dest - 1], origRating);
                            else
                                cout << "Original hospital: " << hospital_names[dest - 1] << " (Hospital Rating: Not Rated)" << endl;
                            if (recRating > 0)
                                printf("Recommended hospital: %s (Hospital Rating: %.1f stars)\n",
                                       hospital_names[bestHospital - 1], recRating);
                            else
                                cout << "Recommended hospital: " << hospital_names[bestHospital - 1] << " (Hospital Rating: Not Rated)" << endl;
                            cout << "Would you like to switch to the recommended hospital? (y/n): ";
                            char switchChoice;
                            cin >> switchChoice;
                            if (switchChoice == 'y' || switchChoice == 'Y') {
                                dest = bestHospital;

                                // Reset arrays for new route calculation
                                for (int i = 0; i < hospitals; i++) {
                                    distance[i] = INT_MAX;
                                    previous[i] = -1;
                                    visited[i] = false;
                                }

                                // Set distance to source to 0
                                distance[src - 1] = 0;

                                // Find the optimal route for new destination
                                for (int count = 0; count < hospitals - 1; count++) {
                                    int u = -1;
                                    int minDistance = INT_MAX;

                                    for (int v = 0; v < hospitals; v++) {
                                        if (!visited[v] && distance[v] < minDistance) {
                                            u = v;
                                            minDistance = distance[v];
                                        }
                                    }

                                    visited[u] = true;

                                    Node* cur2 = adjList[u];
                                    while (cur2 != nullptr) {
                                        int v = atoi(cur2->hospital_name) - 1;
                                        if (!visited[v] && distance[u] + cur2->weight < distance[v]) {
                                            distance[v] = distance[u] + cur2->weight;
                                            previous[v] = u;
                                        }
                                        cur2 = cur2->link;
                                    }
                                }

                                // Display the new optimal route
                                cout << "\nNew optimal route from " << hospital_names[src - 1] << " to " << hospital_names[dest - 1] << ": " << endl;
                                current = dest - 1;
                                edgeCount = 0;
                                totalWeight = 0;
                                routeLen = 0;

                                while (current != -1) {
                                    route[routeLen++] = current;
                                    int prev = previous[current];
                                    if (prev != -1) {
                                        totalWeight += weights[prev][current];
                                        edgeCount++;
                                        cout << hospital_names[current] << " <- ";
                                    } else {
                                        cout << hospital_names[current];
                                    }
                                    current = prev;
                                }
                                cout << endl;
                            }
                        }

                        // Display feedback for the chosen/recommended hospital
                        cout << "\n=== Current Feedback for " << hospital_names[dest - 1] << " ===" << endl;
                        double avgRating = calculateAverageFeedbackRating(dest, hospital_names);
                        if (avgRating > 0) {
                            printf("Hospital Rating: %.1f stars\n", avgRating);
                        } else {
                            cout << "Status: Not Rated" << endl;
                        }
                        displayHospitalFeedback(dest, hospital_names);

                        double currentRating = calculateAverageFeedbackRating(dest, hospital_names);
                        if (currentRating > 0)
                            printf("Current Hospital Rating: %.1f stars\n", currentRating);
                        else
                            cout << "Current Hospital Rating: Not Rated" << endl;
                        printf("Average Edge Weight: %.2lf\n", averageWeight);
                        double optimalCost = averageWeight * moneyFactor;
                        printf("Optimal Cost: %.2lf INR\n", optimalCost);

                        // Find and dispatch the nearest available ambulance
                        int ambIdx = findNearestAmbulance(ambulances, ambCount, src, weights);
                        if (ambIdx != -1) {
                            char dispatchMsg[200];
                            sprintf(dispatchMsg, "NON-EMERGENCY: Dispatching Ambulance %d from %s to %s",
                                    ambulances[ambIdx].id,
                                    hospital_names[ambulances[ambIdx].location - 1],
                                    hospital_names[dest - 1]);
                            displayDispatchTimestamp(dispatchMsg);
                            for (int i = routeLen - 1; i > 0; --i) {
                                simulateAmbulanceMovement(hospital_names[route[i]], hospital_names[route[i - 1]], 15, 60);
                            }
                            int fuelUsed = (int)(averageWeight * 0.5);
                            ambulances[ambIdx].fuel = ambulances[ambIdx].fuel - fuelUsed;
                            updateAmbulanceStatus(ambulances[ambIdx].id, dest,
                                                  "busy", ambulances[ambIdx].fuel);
                            sprintf(dispatchMsg, "Ambulance %d completed transport to %s",
                                    ambulances[ambIdx].id,
                                    hospital_names[dest - 1]);
                            displayDispatchTimestamp(dispatchMsg);
                            printf("Ambulance %d dispatched to Hospital %s with a delay of %.2f seconds.\n",
                                   ambulances[ambIdx].id,
                                   hospital_names[dest - 1],
                                   averageWeight);
                            cout << "Remaining fuel: " << ambulances[ambIdx].fuel << "%" << endl;
                            setAmbulanceAvailableLater(ambulances[ambIdx].id, dest);
                        } else {
                            cout << "No available ambulance could be dispatched!" << endl;
                        }

                        // Show all ambulances and their time delays AFTER dispatch
                        int ambCountAfter = readAmbulances(ambulances, MAX_AMBULANCES);
                        cout << "\n=== AMBULANCE LIST (after dispatch) ===" << endl;
                        displayAllAmbulances(ambulances, ambCountAfter, hospital_names, src, weights);
                        cout << "=== END OF AMBULANCE LIST ===" << endl << endl;
                        cout.flush();

                        if (handlePatientDetails(src, dest, averageWeight, hospital_names, moneyFactor, 1)) {
                            cout << "Patient can be admitted to the hospital." << endl << endl;
                            float totalExp;
                            totalExp = get_patient_param(current_patient, "Total_expenditure(INR)");
                            totalExp += optimalCost;
                            set_patient_param(current_patient, "Total_expenditure(INR)", totalExp);
                            set_patient_param(current_patient, "Current_Treatment_Cost(INR)", (float)optimalCost);
                            set_patient_param(current_patient, "Severity", (float)1);
                        } else {
                            cout << "Patient can not be admitted due to invalid input." << endl << endl;
                        }
                        break;
                    } else {
                        cout << "No direct or adjacent edge found between the source and destination." << endl;
                    }
                }
            }
            break;

        case 2:
            while (true) {
                cout << "Enter the hospital number to print its name and feedback: ";
                if (cin >> near_hosp && near_hosp >= 1 && near_hosp <= hospitals)
                    break;
                cout << "Invalid hospital number. Please enter a number between 1 and " << hospitals << "." << endl;
                cin.clear();
                cin.ignore(10000, '\n');
            }
            printHospitalName(near_hosp, hospital_names);

            {
                // Get and display average feedback rating instead of static rating
                double avgRating = calculateAverageFeedbackRating(near_hosp, hospital_names);
                if (avgRating > 0) {
                    printf("\nHospital Feedback Rating: %.1f stars (based on user feedback)\n", avgRating);
                } else {
                    cout << "\nNo user feedback ratings available yet" << endl;
                }

                displayHospitalFeedback(near_hosp, hospital_names);
            }
            break;

        case 3:
            displayAdjacencyList(adjList, hospitals, hospital_names);
            break;

        case 4:
        {
            int searchId;
            cout << "Enter Patient ID to search: ";
            cin >> searchId;

            Patient *patient = searchPatientById(searchId);
            if (patient) {
                cout << "\nPatient Found:" << endl;
                cout << "Name: " << patient->name << endl;
                cout << "Age: " << patient->age << endl;
                cout << "Blood Group: " << patient->bloodGroup << endl;
                cout << "Patient ID: " << patient->id << endl;
                cout << "Vaccines Done: " << patient->vaccinesDone << endl;
                cout << "Area of Treatment: " << patient->areaOfTreatment << endl;
                cout << "Insurance: " << patient->insurance << endl;
                cout << "Phone Number: " << patient->phoneNumber << endl;
                cout << "Hospital Assigned: " << patient->hospitalAssigned << endl;
                printf("Optimal Cost: %.2f INR\n", patient->optimalCost);
                printf("Severity: %.2f\n", patient->severity);
                printf("Current Treatment Cost: %.2f INR\n", patient->current_treatment_cost);
                printf("Total Expenditure: %.2f INR\n", patient->total_expenditure);
                delete patient;
            } else {
                cout << "Patient not found." << endl;
            }
            break;
        }

        case 5:
        {
            int updateId;
            cout << "Enter Patient ID to update: ";
            if (!(cin >> updateId)) {
                cout << "Invalid input for Patient ID." << endl;
                clear_input_buffer();
                return 1;
            }
            clear_input_buffer(); // Clear buffer after cin >>

            Patient *patient = searchPatientById(updateId);
            if (patient) {
                char input_buffer[MAX_FIELD_LEN];
                char char_input;
                int int_input;
                double double_input;
                char num_str[30];

                cout << "\n--- Updating Patient ID: " << patient->id << " ---" << endl;
                cout << "Current Name: " << patient->name << endl;
                cout << "Current Age: " << patient->age << endl;
                cout << "Current Blood Group: " << patient->bloodGroup << endl;
                cout << "Current Vaccines Done: " << patient->vaccinesDone << endl;
                cout << "Current Area of Treatment: " << patient->areaOfTreatment << endl;
                cout << "Current Insurance: " << patient->insurance << endl;
                cout << "Current Phone Number: " << patient->phoneNumber << endl;
                cout << "Current Hospital Assigned: " << patient->hospitalAssigned << endl;
                printf("Current Optimal Cost: %.2lf\n", patient->optimalCost);
                printf("Current Severity: %.2f\n", patient->severity);
                printf("Current Current Treatment Cost: %.2f INR\n", patient->current_treatment_cost);
                printf("Current Total Expenditure: %.2f INR\n", patient->total_expenditure);
                cout << "-------------------------------" << endl;

                // Name
                cout << "Enter new name (leave blank to keep '" << patient->name << "'): ";
                cin.getline(input_buffer, MAX_FIELD_LEN);
                if (strlen(input_buffer) > 0) {
                    strcpy(patient->name, input_buffer);
                }

                // Age
                cout << "Enter new age (leave blank to keep '" << patient->age << "'): ";
                cin.getline(num_str, sizeof(num_str));
                if (strlen(num_str) > 0) {
                    if (sscanf(num_str, "%d", &int_input) == 1) {
                        patient->age = int_input;
                    } else {
                        cout << "Invalid input for age. Keeping original." << endl;
                    }
                }

                // Blood Group
                cout << "Enter new blood group (leave blank to keep '" << patient->bloodGroup << "'): ";
                cin.getline(input_buffer, MAX_FIELD_LEN);
                if (strlen(input_buffer) > 0) {
                    strcpy(patient->bloodGroup, input_buffer);
                }

                // Vaccines Done
                cout << "Enter vaccines done (Y/N, leave blank to keep '" << patient->vaccinesDone << "'): ";
                cin.getline(input_buffer, MAX_FIELD_LEN);
                if (strlen(input_buffer) > 0) {
                    if (sscanf(input_buffer, "%c", &char_input) == 1 &&
                        (char_input == 'Y' || char_input == 'N' || char_input == 'y' || char_input == 'n')) {
                        patient->vaccinesDone = toupper(char_input);
                    } else {
                        cout << "Invalid input for vaccines done. Keeping original." << endl;
                    }
                }

                // Area of Treatment
                cout << "Enter new area of treatment (leave blank to keep '" << patient->areaOfTreatment << "'): ";
                cin.getline(input_buffer, MAX_FIELD_LEN);
                if (strlen(input_buffer) > 0) {
                    strcpy(patient->areaOfTreatment, input_buffer);
                }

                // Insurance
                cout << "Enter new insurance details (leave blank to keep '" << patient->insurance << "'): ";
                cin.getline(input_buffer, MAX_FIELD_LEN);
                if (strlen(input_buffer) > 0) {
                    strcpy(patient->insurance, input_buffer);
                }

                // Phone Number
                cout << "Enter new phone number (leave blank to keep '" << patient->phoneNumber << "'): ";
                cin.getline(input_buffer, MAX_FIELD_LEN);
                if (strlen(input_buffer) > 0) {
                    strcpy(patient->phoneNumber, input_buffer);
                }

                // Hospital Assigned
                cout << "Enter new hospital assigned (leave blank to keep '" << patient->hospitalAssigned << "'): ";
                cin.getline(input_buffer, MAX_FIELD_LEN);
                if (strlen(input_buffer) > 0) {
                    strcpy(patient->hospitalAssigned, input_buffer);
                }

                // Optimal Cost
                printf("Enter new optimal cost (leave blank to keep '%.2lf'): ", patient->optimalCost);
                cin.getline(num_str, sizeof(num_str));
                if (strlen(num_str) > 0) {
                    if (sscanf(num_str, "%lf", &double_input) == 1) {
                        patient->optimalCost = double_input;
                    } else {
                        cout << "Invalid input for optimal cost. Keeping original." << endl;
                    }
                }

                if (updatePatientRecord(patient)) {
                    cout << "Record updated successfully." << endl;
                } else {
                    cout << "Error updating record." << endl;
                }
                delete patient;
            } else {
                cout << "Patient not found." << endl;
            }
            break;
        }

        case 6:
        {
            generatePatientStatistics();
            break;
        }

        case 7:
        {
            int feedbackHospital;
            char feedback[500];
            int rating;

            // Get hospital number
            while (true) {
                cout << "\nEnter hospital number (1-15) to provide feedback: ";
                if (cin >> feedbackHospital && feedbackHospital >= 1 && feedbackHospital <= 15) {
                    break;
                }
                cout << "Invalid hospital number. Please enter a number between 1 and 15." << endl;
                cin.clear();
                cin.ignore(10000, '\n');
            }
            cin.ignore(10000, '\n'); // Clear input buffer

            // Get rating
            while (true) {
                cout << "Enter rating (1-5 stars): ";
                if (cin >> rating && rating >= 1 && rating <= 5) {
                    break;
                }
                cout << "Invalid rating. Please enter a number between 1 and 5." << endl;
                cin.clear();
                cin.ignore(10000, '\n');
            }
            cin.ignore(10000, '\n'); // Clear input buffer

            // Get feedback
            cout << "Enter your feedback (max 500 characters):" << endl;
            cin.getline(feedback, sizeof(feedback));

            // Save feedback
            saveFeedback(feedbackHospital, feedback, rating, hospital_names);
            cout << "\nThank you for your feedback!" << endl;
            break;
        }

        case 8:
            return 0;

        default:
            cout << "Invalid choice. Please enter a valid option." << endl;
        }
    }
}
