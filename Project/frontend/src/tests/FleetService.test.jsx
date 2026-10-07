import {vi} from 'vitest';
import {io} from 'socket.io-client';
import fleetService from '../services/fleetService';
vi.mock('socket.io-client',()=>({io:vi.fn()}));
vi.mock('../services/api',()=>({default:{get:vi.fn()},getAuthToken:()=> 'synthetic-token'}));
let handlers, socket;
beforeEach(()=>{vi.useFakeTimers();handlers={};socket={on:vi.fn((name,callback)=>{handlers[name]=callback;}),emit:vi.fn(),connect:vi.fn(),disconnect:vi.fn()};io.mockReturnValue(socket);});
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
test('transport reconnect remains enabled through a long outage with a bounded retry delay',()=>{
 fleetService.connect({});
 expect(io.mock.calls[0][1]).toMatchObject({reconnection:true,reconnectionAttempts:Infinity,reconnectionDelayMax:5000});
 handlers.connect();expect(socket.emit).toHaveBeenCalledWith('fleet:resync');
});
test('temporary auth-store failures retry, rejected credentials stop, and unmount cancels retry',()=>{
 fleetService.connect({});
 handlers.connect_error({data:{retryable:false}});vi.advanceTimersByTime(6000);expect(socket.connect).not.toHaveBeenCalled();
 handlers.connect_error({data:{retryable:true}});vi.advanceTimersByTime(5000);expect(socket.connect).toHaveBeenCalledTimes(1);
 handlers.connect_error({data:{retryable:true}});socket.disconnect();vi.advanceTimersByTime(6000);expect(socket.connect).toHaveBeenCalledTimes(1);
});
