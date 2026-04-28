#include <iostream>
#include <fstream>
#include <string>
#include <cstring>
#include <cctype>
#include <cstdio>

using namespace std;

#define MAX_ENTRIES 100
#define MAX_LINE_LENGTH 100

struct Patient {
    char name[50];
    int age;
    char bloodGroup[10];
    int patientID;
    char vaccinesDone;
    char areaOfTreatment[20];
    char insurance[5];
    long long phoneNumber;
    char hospitalAssigned[50];
    float optimalCost;
};

struct InvalidPatient {
    Patient data;
    char reason[100];
};

int isValidName(const char *name) {
    if (strlen(name) == 0) return 0;
    for (int i = 0; name[i]; i++) {
        if (!isalpha(name[i]) && name[i] != ' ') return 0;
    }
    return 1;
}

int isValidPhoneNumber(long long phone) {
    return (phone >= 1000000000LL && phone <= 9999999999LL); // ensure 10-digit number
}

int isValidPatientID(int id) {
    return (id > 0);
}

// Helper to read all remaining fields of an entry into a Patient struct
void readRemainingFields(ifstream &file, Patient &p, int fieldsAlreadyRead) {
    char line[MAX_LINE_LENGTH];
    // fieldsAlreadyRead indicates how many fields (after Patient ID) have been read
    // Full order: Name(1), Age(2), BloodGroup(3), Vaccines(4), Area(5), Insurance(6), Phone(7), Hospital(8), OptimalCost(9)
    // + 4 trailing lines (Severity, Current_Treatment_Cost, Total_expenditure, separator)

    if (fieldsAlreadyRead < 1 && file.getline(line, sizeof(line)))
        sscanf(line, "Name: %[^\n]", p.name);
    if (fieldsAlreadyRead < 2 && file.getline(line, sizeof(line)))
        sscanf(line, "Age: %d", &p.age);
    if (fieldsAlreadyRead < 3 && file.getline(line, sizeof(line)))
        sscanf(line, "Blood Group: %[^\n]", p.bloodGroup);
    if (fieldsAlreadyRead < 4 && file.getline(line, sizeof(line)))
        sscanf(line, "Vaccines Done: %c", &p.vaccinesDone);
    if (fieldsAlreadyRead < 5 && file.getline(line, sizeof(line)))
        sscanf(line, "Area of Treatment: %[^\n]", p.areaOfTreatment);
    if (fieldsAlreadyRead < 6 && file.getline(line, sizeof(line)))
        sscanf(line, "Insurance: %[^\n]", p.insurance);
    if (fieldsAlreadyRead < 7 && file.getline(line, sizeof(line)))
        sscanf(line, "Phone Number: %lld", &p.phoneNumber);
    if (fieldsAlreadyRead < 8 && file.getline(line, sizeof(line)))
        sscanf(line, "Hospital Assigned: %[^\n]", p.hospitalAssigned);
    if (fieldsAlreadyRead < 9 && file.getline(line, sizeof(line)))
        sscanf(line, "Optimal Cost: %f", &p.optimalCost);

    // Skip trailing lines: Severity, Current_Treatment_Cost, Total_expenditure, separator
    for (int s = 0; s < 4; s++) file.getline(line, sizeof(line));
}

void printPatient(const Patient &p) {
    cout << "Name: " << p.name << endl;
    cout << "Age: " << p.age << endl;
    cout << "Blood Group: " << p.bloodGroup << endl;
    cout << "Patient ID: " << p.patientID << endl;
    cout << "Vaccines Done: " << p.vaccinesDone << endl;
    cout << "Area of Treatment: " << p.areaOfTreatment << endl;
    cout << "Insurance: " << p.insurance << endl;
    cout << "Phone Number: " << p.phoneNumber << endl;
    cout << "Hospital Assigned: " << p.hospitalAssigned << endl;
    printf("Optimal Cost: %.2f\n", p.optimalCost);
    cout << "-----------------" << endl;
}

int main() {
    ifstream file("patient_details.txt");
    if (!file.is_open()) {
        perror("Error opening file");
        return 1;
    }

    char line[MAX_LINE_LENGTH];
    int entryCount = 0;
    int invalidCount = 0;

    Patient entries[MAX_ENTRIES];
    InvalidPatient invalidEntries[MAX_ENTRIES];

    while (file.getline(line, sizeof(line))) {
        // Each entry in the file starts with "Patient ID:", not "Name:"
        Patient temp;
        memset(&temp, 0, sizeof(Patient));

        if (sscanf(line, "Patient ID: %d", &temp.patientID) == 1) {

            if (!isValidPatientID(temp.patientID)) {
                // Read all remaining fields so we can display this entry
                readRemainingFields(file, temp, 0);
                strcpy(invalidEntries[invalidCount].reason, "Invalid Patient ID (must be > 0)");
                invalidEntries[invalidCount].data = temp;
                invalidCount++;
                continue;
            }

            if (file.getline(line, sizeof(line)))
                sscanf(line, "Name: %[^\n]", temp.name);

            if (!isValidName(temp.name)) {
                // Read remaining fields from Age onward
                readRemainingFields(file, temp, 1);
                sprintf(invalidEntries[invalidCount].reason, "Invalid Name: '%s' (only letters and spaces allowed)", temp.name);
                invalidEntries[invalidCount].data = temp;
                invalidCount++;
                continue;
            }

            if (file.getline(line, sizeof(line)))
                sscanf(line, "Age: %d", &temp.age);
            if (file.getline(line, sizeof(line)))
                sscanf(line, "Blood Group: %[^\n]", temp.bloodGroup);
            if (file.getline(line, sizeof(line)))
                sscanf(line, "Vaccines Done: %c", &temp.vaccinesDone);
            if (file.getline(line, sizeof(line)))
                sscanf(line, "Area of Treatment: %[^\n]", temp.areaOfTreatment);
            if (file.getline(line, sizeof(line)))
                sscanf(line, "Insurance: %[^\n]", temp.insurance);
            if (file.getline(line, sizeof(line)))
                sscanf(line, "Phone Number: %lld", &temp.phoneNumber);

            if (!isValidPhoneNumber(temp.phoneNumber)) {
                // Read remaining fields from Hospital onward
                readRemainingFields(file, temp, 7);
                sprintf(invalidEntries[invalidCount].reason, "Invalid Phone Number: %lld (must be 10 digits)", temp.phoneNumber);
                invalidEntries[invalidCount].data = temp;
                invalidCount++;
                continue;
            }

            if (file.getline(line, sizeof(line)))
                sscanf(line, "Hospital Assigned: %[^\n]", temp.hospitalAssigned);
            if (file.getline(line, sizeof(line)))
                sscanf(line, "Optimal Cost: %f", &temp.optimalCost);

            // Skip extra fields: Severity, Current_Treatment_Cost, Total_expenditure, separator
            for (int s = 0; s < 4; s++) file.getline(line, sizeof(line));

            entries[entryCount] = temp;
            entryCount++;
        }
    }

    file.close();

    // ===== Print Valid Entries =====
    cout << "========================================" << endl;
    cout << "      VALID PATIENT ENTRIES (" << entryCount << ")" << endl;
    cout << "========================================" << endl << endl;

    for (int i = 0; i < entryCount; i++) {
        printPatient(entries[i]);
    }

    // ===== Print Invalid Entries =====
    if (invalidCount > 0) {
        cout << endl;
        cout << "========================================" << endl;
        cout << "    INVALID PATIENT ENTRIES (" << invalidCount << ")" << endl;
        cout << "========================================" << endl << endl;

        for (int i = 0; i < invalidCount; i++) {
            cout << ">> Issue: " << invalidEntries[i].reason << endl;
            printPatient(invalidEntries[i].data);
        }
    } else {
        cout << endl << "All entries are valid!" << endl;
    }

    return 0;
}
