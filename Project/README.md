# Dynamic Ambulance Dispatch System — MSSQL storage

The application now keeps its existing dispatch, routing, OTP, cost, severity, and menu logic, but its persistent source of truth is Microsoft SQL Server through ODBC. The legacy text files are used only by the one-time importer.

## Setup

1. Run [`database_schema.sql`](database_schema.sql) in SSMS, or run `sqlcmd -E -i database_schema.sql` from this directory. It creates and seeds `DynamicAmbulanceDispatch` with the 15 hospitals, all 225 route values, and the 20 ambulance records.
2. Set `DB_SERVER` and `DB_NAME`; use [`.env.example`](.env.example) as the setting reference. Set `DB_USER` and `DB_PASSWORD` only for SQL authentication. No password is stored in source code.
3. Build the application with an ODBC library, for example using MSYS2 UCRT64:

   `g++ -std=c++17 -static -static-libgcc -static-libstdc++ hospital_final.cpp database_repository.cpp -lodbc32 -o hospital_mssql.exe`

4. Before the first normal run, import legacy records once:

   `g++ -std=c++17 -static -static-libgcc -static-libstdc++ migrate_existing_data.cpp database_repository.cpp -lodbc32 -o migrate_existing_data.exe`

   `./migrate_existing_data.exe`

The importer reads `patient_details.txt`, `ambulance_locations.txt`, `hospital_feedback.txt`, and `ambulance_timeline.txt` once. Do not run it again unless you intentionally want to append the legacy feedback/timeline history again.
