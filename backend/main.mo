import Principal "mo:base/Principal";
import Debug "mo:base/Debug";

actor {
  public shared ({ caller }) func sendMessage(message : Text) : async Text {
    if (Principal.isAnonymous(caller)) {
      Debug.trap("Anonymous callers are not allowed. Please authenticate first.");
    };
    "Received '" # message # "' from " # Principal.toText(caller);
  };
};
