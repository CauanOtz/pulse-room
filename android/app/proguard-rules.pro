# LiveKit and kotlinx.serialization ship their own consumer rules.
-keepattributes Signature,InnerClasses,EnclosingMethod

# The release build is the one friends install, and a stripped serializer only
# fails at runtime, so the models keep theirs explicitly.
-keepclassmembers class com.pulseroom.android.data.** {
    *** Companion;
}
-keepclasseswithmembers class com.pulseroom.android.data.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.pulseroom.android.data.**$$serializer { *; }
