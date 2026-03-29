import Foundation
import Contacts
import React

@objc(ContactsBridge)
class ContactsBridge: NSObject {
  
  private let store = CNContactStore()
  
  @objc func search(_ query: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else {
        reject("PERMISSION", "Contacts access denied", nil)
        return
      }
      
      let keysToFetch: [CNKeyDescriptor] = [
        CNContactGivenNameKey as CNKeyDescriptor,
        CNContactFamilyNameKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor,
        CNContactEmailAddressesKey as CNKeyDescriptor,
        CNContactOrganizationNameKey as CNKeyDescriptor,
      ]
      
      let predicate = CNContact.predicateForContacts(matchingName: query)
      
      do {
        let contacts = try self.store.unifiedContacts(matching: predicate, keysToFetch: keysToFetch)
        let mapped = contacts.map { c -> [String: Any] in
          return [
            "id": c.identifier,
            "name": "\(c.givenName) \(c.familyName)".trimmingCharacters(in: .whitespaces),
            "phone": c.phoneNumbers.first?.value.stringValue ?? "",
            "email": (c.emailAddresses.first?.value as String?) ?? "",
            "company": c.organizationName,
          ]
        }
        resolve(mapped)
      } catch {
        reject("SEARCH", "Search failed: \(error.localizedDescription)", error)
      }
    }
  }
  
  @objc func create(_ details: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else {
        reject("PERMISSION", "Contacts access denied", nil)
        return
      }
      
      let contact = CNMutableContact()
      contact.givenName = details["firstName"] as? String ?? ""
      contact.familyName = details["lastName"] as? String ?? ""
      
      if let phone = details["phone"] as? String, !phone.isEmpty {
        contact.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: phone))]
      }
      if let email = details["email"] as? String, !email.isEmpty {
        contact.emailAddresses = [CNLabeledValue(label: CNLabelWork, value: email as NSString)]
      }
      if let company = details["company"] as? String {
        contact.organizationName = company
      }
      
      let request = CNSaveRequest()
      request.add(contact, toContainerWithIdentifier: nil)
      
      do {
        try self.store.execute(request)
        resolve(contact.identifier)
      } catch {
        reject("SAVE", "Failed to save contact: \(error.localizedDescription)", error)
      }
    }
  }
  
  @objc func getById(_ contactId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else {
        reject("PERMISSION", "Contacts access denied", nil)
        return
      }
      
      let keysToFetch: [CNKeyDescriptor] = [
        CNContactGivenNameKey as CNKeyDescriptor,
        CNContactFamilyNameKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor,
        CNContactEmailAddressesKey as CNKeyDescriptor,
        CNContactOrganizationNameKey as CNKeyDescriptor,
        CNContactPostalAddressesKey as CNKeyDescriptor,
        CNContactBirthdayKey as CNKeyDescriptor,
        CNContactNoteKey as CNKeyDescriptor,
      ]
      
      do {
        let contact = try self.store.unifiedContact(withIdentifier: contactId, keysToFetch: keysToFetch)
        resolve([
          "id": contact.identifier,
          "firstName": contact.givenName,
          "lastName": contact.familyName,
          "phones": contact.phoneNumbers.map { ["label": $0.label ?? "", "number": $0.value.stringValue] },
          "emails": contact.emailAddresses.map { ["label": $0.label ?? "", "email": $0.value as String] },
          "company": contact.organizationName,
          "note": contact.note,
        ])
      } catch {
        reject("NOT_FOUND", "Contact not found", error)
      }
    }
  }
  
  private func requestAccess(completion: @escaping (Bool) -> Void) {
    if #available(iOS 18.0, *) {
      store.requestAccess(for: .contacts) { granted, _ in completion(granted) }
    } else {
      store.requestAccess(for: .contacts) { granted, _ in completion(granted) }
    }
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
