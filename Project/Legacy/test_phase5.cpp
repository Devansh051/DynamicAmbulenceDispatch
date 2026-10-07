#define main legacyApplicationMain
#include "hospital_final.cpp"
#undef main
#include <cassert>

int main() {
    int weights[15][15]{};
    char names[15][50]{};
    for (int i=0;i<15;++i) { snprintf(names[i],50,"%d.Test",i+1); for(int j=0;j<15;++j) weights[i][j]=i==j?0:10000; }
    weights[0][1]=2; weights[1][2]=1; weights[0][2]=5;
    findShortestPath(15,weights,0,2,names);
    assert(weights[0][2]==3); assert(weights[0][3]==10000);
    Node* adjacency[15]{};
    adjacency[0]=insert_rear(names[1],0,2,adjacency[0]);
    adjacency[0]=insert_rear(names[2],0,5,adjacency[0]);
    adjacency[1]=insert_rear(names[2],0,1,adjacency[1]);
    int distance[15],previous[15]; computeShortestPaths(15,adjacency,0,distance,previous);
    assert(distance[2]==3 && previous[2]==1 && distance[3]==INT_MAX);
    Ambulance vehicles[4]{};
    for(int i=0;i<4;++i) { vehicles[i].id=i+1; vehicles[i].location=i+1; vehicles[i].fuel=100; strcpy(vehicles[i].status,"available"); }
    vehicles[0].fuel=10; strcpy(vehicles[1].status,"busy"); vehicles[2].location=1000;
    weights[3][0]=4;
    assert(findNearestAmbulance(vehicles,4,1,weights)==3);
    vehicles[0].fuel=100;
    assert(findNearestAmbulance(vehicles,4,1,weights)==0);
    assert(findNearestAmbulance(vehicles,4,0,weights)==-1);
    for(auto& list:adjacency) while(list) { Node* next=list->link; delete list; list=next; }
    std::cout << "Actual legacy solvers: Floyd-Warshall, Dijkstra/disconnected graph, ambulance eligibility/bounds passed.\n";
    if(std::getenv("VERIFY_LEGACY_SQL")) {
        assert(database().connectFromEnvironment());
        int matrix[15][15],casualties[15][15];
        assert(database().loadHospitalData(matrix,casualties,weights,names));
        Ambulance fleet[100]{}; int count=database().getAmbulances(fleet,100); assert(count>0);
        Ambulance before{},after{}; assert(database().getAmbulanceById(fleet[0].id,before));
        assert(!database().dispatchAmbulance(before.id,before.location,"busy",before.fuel,"Test","Guard regression"));
        assert(database().getAmbulanceById(before.id,after)); assert(strcmp(before.status,after.status)==0);
        std::cout << "Real ODBC schema reads and Phase 5 legacy write guard passed.\n";
    }
    return 0;
}
