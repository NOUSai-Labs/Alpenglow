#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(CalendarBridge, NSObject)
RCT_EXTERN_METHOD(getEvents:(NSString *)startDate endDate:(NSString *)endDate resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(createEvent:(NSDictionary *)details resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(deleteEvent:(NSString *)eventId resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
RCT_EXTERN_METHOD(updateEvent:(NSString *)eventId details:(NSDictionary *)details resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
