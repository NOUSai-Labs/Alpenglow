#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PhotosBridge, NSObject)
RCT_EXTERN_METHOD(getRecent:(int)count resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getAlbums:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(search:(NSString *)query resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
