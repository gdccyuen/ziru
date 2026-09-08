# Digital Policy Office

# INFORMATION SECURITY

# Practice Guide

for

# Mobile Security

[ISPG-SM03]

Version 2.1

July 2024

© The Government of the Hong Kong Special Administrative Region of the People's Republic of China

<table><tr><td>Administrative Region of the People&#x27;s Republic of China.</td><td>The contents of this document remain the property of and may not be reproduced in whole or in part without the express permission of the Government of the Hong Kong Special</td></tr></table>

## COPYRIGHT NOTICE

© 2024 by the Government of the Hong Kong Special Administrative Region of the People's Republic of China

Unless otherwise indicated, the copyright in the works contained in this publication is owned by the Government of the Hong Kong Special Administrative Region of the People's Republic of China. You may generally copy and distribute these materials in any format or medium provided the following conditions are met –

(a) the particular item has not been specifically indicated to be excluded and is therefore not to be copied or distributed;

(b) the copying is not done for the purpose of creating copies for sale;

(c) the materials must be reproduced accurately and must not be used in a misleading context; and

(d) the copies shall be accompanied by the words “copied/distributed with the permission of the Government of the Hong Kong Special Administrative Region of the People's Republic of China. All rights reserved.”

If you wish to make copies for purposes other than that permitted above, you should seek permission by contacting the Digital Policy Office.

<table><tr><td rowspan=1 colspan=5>Amendment History</td></tr><tr><td rowspan=1 colspan=1>ChangeNumber</td><td rowspan=1 colspan=1>Revision Description</td><td rowspan=1 colspan=1>PagesAffected</td><td rowspan=1 colspan=1>RevisionNumber</td><td rowspan=1 colspan=1>Date</td></tr><tr><td rowspan=1 colspan=1>1</td><td rowspan=1 colspan=1>Renamed the document from &quot;PracticeGuide for Mobile Device Security 1.0&quot; to&quot;Practice Guide for Mobile Security 1.1&quot;,added new chapters on informationsecurity management and mobile appdevelopment, and aligned referenceswith other practice guides.</td><td rowspan=1 colspan=1>Wholedocument</td><td rowspan=1 colspan=1>1.1</td><td rowspan=1 colspan=1>July 2018</td></tr><tr><td rowspan=1 colspan=1>2</td><td rowspan=1 colspan=1>Enhanced the document content withguidance on mobile device management;data protection of mobile apps;best practices on secure mobile appsdevelopment; andassessment guidelines to authorisedmobile apps</td><td rowspan=1 colspan=1>Pages12;14-15;20-21;28,30,31;Annex C</td><td rowspan=1 colspan=1>2.0</td><td rowspan=1 colspan=1>June 2021</td></tr><tr><td rowspan=1 colspan=1>3</td><td rowspan=1 colspan=1>Change “Office of the Government ChiefInformation Officer&quot; (or “OGCIO&quot;) to&quot;Digital Policy Office&quot; (or &quot;DPO&quot;)</td><td rowspan=1 colspan=1></td><td rowspan=1 colspan=1>2.1</td><td rowspan=1 colspan=1>July 2024</td></tr></table>

## Table of Contents

1. Introduction   
1.1 Purpos   
1.2 Normative References 2   
1.3 Terms and Convention. 2   
1.4 Contact . . 2   
2. Information Security Management . ..3   
3. Introduction to Mobile Security. ..5   
3.1 Threats with Mobile Technology 5   
4. Mobile Device Security Management . .10   
4.1 Mobile Device Usage Lifecycle.. 10   
4.2 Mobile Device Management Solution 17   
4.3 Scenario Specific Security Guidance. . 20   
4.4 Security Guidance On Privately-Owned Mobile Devices 24   
4.5 Restrictions on Mobile Devices and Access Levels . . 25   
5. Mobile App Development Security ... ..26   
5.1 Considerations in Mobile App Development 26   
5.2 Mobile App Development Lifecycle . 27   
5.3 Security by Design and Data Privacy . 30   
5.4 Testing for Mobile App Development. 31   
5.5 Points to Note for Securing Mobile App Development.. . 33   
5.6 Best Practices on Secure Mobile Development for Android and iOS . . 35   
Annex A: Sample Configurations for Security Hardening . .37   
Annex B: Containerisation Technology... ..39   
Annex C: Assessment Guidelines to Authorised Mobile Apps . .41

## 1. Introduction

As mobile devices are commonly used to access information anytime, anywhere, it brings new risks in daily operation. While mobile devices and mobile applications (apps) installed in the devices bring convenience and improve efficiency, insecure protection of mobile devices or insecurely written mobile apps pose risks to mobile users and may cause data loss or reputation damage to the apps owners/developer. In view of the extra risks introduced by mobile devices due to its high portability, wireless connection capabilities and diverse techniques in mobile app development, this practice guide is developed to provide guidance notes for Bureaux/Departments (B/Ds) to make reference to the securing the use of mobile devices in their business and the development of mobile apps for business use.

## 1.1 Purpose

The purpose of this document is to provide common security considerations and best practices to B/Ds on the management and use of mobile devices as well as secure development of mobile apps. The best practices on the use and management of mobile devices are described in Section 4 for staff who are involved in the use and adoption of mobile devices and related management solutions. The security best practices on mobile app development are described in Section 5 for developers who are involved in related development life cycle.

This document should be used in conjunction with established government requirements and documents including the Baseline IT Security Policy [S17], the IT Security Guidelines [G3] and other relevant procedures and guidelines. Furthermore, B/Ds should also assess the security risks before adoption of mobile device solutions based on their business needs. B/Ds should consider the security measures and best practices recommended in this document and implement adequate security protection for their mobile solutions.

The materials included in this document are general in nature and are prepared irrespective of the types or platforms of the mobile devices. According to the definition in government security documents, the term "mobile devices" means portable computing and communication devices with information storage and processing capability. Examples include portable computers, mobile phones, tablets, digital cameras, and digital audio or video recording devices. Readers should consider and select the security measures and best practices that are applicable to their own environment.

## 1.2 Normative References

The following reference are indispensable for the application of this document.

• Baseline IT Security Policy [S17], the Government of Hong Kong Special Administrative Region

IT Security Guidelines [G3], the Government of Hong Kong Special Administrative Region

Information technology – Security techniques – Information security management systems – Requirements (second edition), ISO/IEC 27001:2013

Information technology – Security techniques – Code of practice for information security controls (second edition), ISO/IEC 27002:2013

Information technology – Security techniques – Governance of information security, ISO/IEC 27014:2013

Information technology – Security techniques – Storage security, ISO/IEC 27040:2015

## 1.3 Terms and Convention

For the purposes of this document, the terms and convention given in S17, G3 and the following apply.

<table><tr><td colspan="2">Abbreviation and Terms</td></tr><tr><td>NA</td><td>NA</td></tr></table>

## 1.4 Contact

This document is produced and maintained by the Digital Policy Office (DPO). For comments or suggestions, please send to:

Email:

it\_security@digitalpolicy.gov.hk

Lotus Notes mail:

IT Security Team/DPO/HKSARG@DPO

CMMP mail:

IT Security Team/DPO

## 2. Information Security Management

Information security is about the planning, implementation and continuous enhancement of security controls and measures to protect the confidentiality, integrity and availability of information assets, whether in storage, processing, or transmission and its associated information systems. Information security management is a set of principles relating to the functions of planning, organising, directing, controlling, and the application of these principles in harnessing physical, financial, human and informational resources efficiently and effectively to assure the safety of information assets and information systems.

Information security management involves a series of activities that require continuous monitoring and control. These activities include but not limited to the following functional areas:

• Security Management Framework and the Organisation;

• Governance, Risk Management, and Compliance;

• Security Operations;

• Security Event and Incident Management;

• Awareness Training and Capability Building; and

• Situational Awareness and Information Sharing.

## Security Management Framework and Organisation

B/Ds shall establish and enforce departmental information security policies, standards, guidelines and procedures in accordance with the business needs and the government security requirements.

B/Ds shall also define the organisation structure on information security and provide clear definitions and proper assignment of security accountability and responsibility to involved parties.

## Governance, Risk Management and Compliance

B/Ds shall adopt a risk-based approach to identify, prioritise and address the security risks of information systems in a consistent and effective manner.

B/Ds shall perform security risk assessments for information systems and production applications periodically and when necessary so as to identify risks and consequences associated with vulnerabilities, and to provide a basis to establish a cost-effective security program and implement appropriate security protection and safeguards.

B/Ds shall also perform security audit on information systems regularly to ensure that current security measures comply with departmental information security policies, standards, and other contractual or legal requirements.

## Security Operations

To protect information assets and information systems, B/Ds should implement comprehensive security measures based on their business needs, covering different technological areas in their business, and adopt the principle of "Prevent, Detect, Respond and Recover" in their daily operations.

• Preventive measures avoid or deter the occurrence of an undesirable event;

• Detective measures identify the occurrence of an undesirable event;

Response measures refer to coordinated actions to contain damage when an undesirable event or incident occurs; and

Recovery measures are for restoring the confidentiality, integrity and availability of information systems to their expected state.

## Security Event and Incident Management

In reality, security incidents might still occur due to unforeseeable, disruptive events. In cases where security events compromise business continuity or give rise to risk of data security, B/Ds shall activate their standing incident management plan to identifying, managing, recording, and analysing security threats, attacks, or incidents in real-time. B/Ds should also prepare to communicate appropriately with relevant parties by sharing information on response for security risks to subdue distrust or unnecessary speculation. When developing an incident management plan, B/Ds should plan and prepare the right resources as well as develop the procedures to address necessary follow-up investigations.

## Awareness Training and Capability Building

As information security is everyone's business, B/Ds should continuously promote information security awareness throughout the organisations and arrange training and education to ensure that all related parties understand the risks, observe the security regulations and requirements, and conform to security best practices.

## Situational Awareness and Information Sharing

As cyber threat landscape is constantly changing, B/Ds should also constantly attend to current vulnerabilities information, threat alerts, and important notices disseminated by the security industry and the GovCERT.HK. The security alerts on impending and actual threats should be disseminated to and shared with those responsible colleagues within B/Ds so that timely mitigation measures could be taken.

B/Ds could make use of threat intelligence platforms to receive and share information regarding security issues, vulnerabilities, and cyber threat intelligence.

## 3. Introduction to Mobile Security

Nowadays, mobile devices bring much convenience to users and are vital to business operation. However, they also bring security concerns, e.g. vulnerabilities of mobile applications (mobile apps) increase risk of data loss. This section highlights the security measures and best practices to address the common security concerns. B/Ds may consider the security measures and best practices according to their business needs and environment.

## 3.1 Threats with Mobile Technology

Major threats to mobile devices come from the devices themselves, network connections (e.g. mobile communication networks and Internet) and mobile apps. Comparing with workstations in the office area, mobile devices are generally used and placed in the locations, outdoor or on the road, where they are having higher exposure to threats and loss. The security concerns of mobile technologies are highlighted below:

## Mobile Devices

## • Lack of physical security controls

Mobile devices, usually small in size, are typically used in a variety of locations outside the B/Ds' control, such as employees' homes, coffee shops, hotels, and conference venues. The devices' mobile nature makes them much more likely to be lost or stolen than other devices, so their data is at increased risk of compromise.

## • Insufficient control to accessories in mobile devices

Mobile devices are usually equipped with cameras and microphones. Inappropriate video capturing, audio recording and photo taking may cause a security concern. Moreover, sensitive information in video/audio records or photos might be retrieved by unauthorised persons if the mobile device is not properly protected.

## • Use of untrusted mobile devices

Many mobile devices, particularly those that are privately owned, are not necessarily trustworthy. The use of mobile devices that have been jailbroken or rooted can pose additional security risks because the built-in restrictions on security have been bypassed in such devices.

## • Lack of protection of sensitive information

Mobile devices are used to store sensitive information, including personal information, photos and contact list. The documents with sensitive information may also be downloaded and stored in the mobile devices that have been approved and managed by B/Ds. In order to prevent data breach due to cyber attacks or excessive data collection by mobile apps, these sensitive information is required to be protected by encryption using the mobile devices built-in functions or authorised security protection tools.

## • Insecure lock screen configuration

A lock screen is the first layer of defence to prevent unauthorised access of the mobile devices and the data stored in them. Proper lock screen configuration, for example strong password, can protect the devices from unauthorised access and data disclosure. Besides, some mobile apps may still display push notifications, such as messages, app alerts and email received, on the lock screen. If the content of the notifications contains sensitive information, then the sensitive information would be viewed by unauthorised users.

## • Use of public mobile phone charging facilities

Public mobile phone charging facilities are available in some shopping centres and public transport. If a public mobile phone charging station, in particular with USB charging port, is compromised, malware would be installed to any devices to be connected and sensitive data would also be stolen. Therefore, using suspicious mobile charging facilities should be avoided.

## Networks

## • Use of untrusted networks

Mobile devices primarily use non-organisational networks, such as external Wi-Fi or cellular networks, for Internet access. These networks are susceptible to eavesdropping, which place sensitive information transmitted at risk of compromise.

## • Use of unsecure communication technologies

In contrast to workstations in the office area which mainly rely on Local Area Network (LAN) or office Wi-Fi for communication, mobile users can deploy a wide variety of communication technologies such as Bluetooth, Near Field Communication (NFC) for data connection. Every communication technology has its own security risk. If sensitive information is intercepted over an unsecure communication media, it would lead to a security breach.

## Application

## • Use of authorised apps

To safeguard the mobile security, mobile apps on mobile devices are for business purposes. The installation of mobile apps for personal use, e.g. games, online payment, online shopping, etc., should be avoided as far as possible on the B/Ds’ mobile devices unless a strong justification is provided.

## • Risks of un-trusted apps

Mobile devices are designed to make users easy to find, acquire, install and use third-party applications from mobile app stores. This poses obvious security risks, especially when mobile device platforms and mobile app stores do not place security restrictions or other limitations on the published applications developed by third-party.

## • Risk of exposure of location of mobile devices

Location services are commonly used by social media, navigation and other mobile-centric applications to identify the locations of mobile devices as well as their owner. Mobile devices with location services enabled are at increased risk of targeted attacks because it is easier for potential attackers to determine where the users and the mobile devices are, and to correlate that information with other sources to launch attacks such as spear phishing.

## • Risk of uncontrolled access to sensor/accessories of mobile devices

Mobile apps may induce uncontrolled access to sensors/accessories that are not common to desktop computers, such as built-in camera of smartphones and tablets. This could be at risk of targeted attacks, such as placing malicious 2D barcodes or QR codes at public locations.

## • Risk of geotagging

Commonly available in mobile devices, geotagging is a function that automatically tags geographical information (i.e. location and GPS) to photos and other media taken by the devices. The geographical information may increase the risk of leakage of privacy concern as the names of photo owners and the physical locations of photos taken are inadvertently collected by unknown persons and potential attackers.

## • Potential leakage of personal information

The contact list and address book in the mobile devices are widely used to store personal information such as the names, phone numbers, address, date of birth, email, etc. Some mobile apps may request permission to access the contact list or address book to support operation. If sensitive information, such as PIN, account name, account number or password, is stored in the contact list or address book, this could pose high risk to disclose these sensitive data via the mobile apps.

## Development of Mobile Application

Comparing with using mobile apps, additional security risks are required to be addressed when developing mobile apps. The developers can refer to Open Web Application Security Project (OWASP) Mobile Top 10 to understand those critical risks that mobile app development faces. B/Ds should make reference to these common security risks and avoid such problems in their codes. B/Ds should also review and define the security requirements of their applications to mitigate risks so as to avoid vulnerabilities originated from security design. The risks as mentioned by OWASP are highlighted below:

## • Improper Platform Usage

The potential threat comes from the misuse of a platform feature and failure to use platform security controls, e.g. Android intents, platform permissions, misuse of biometric recognition features or other security controls of the mobile operating system. Misusing platform features may put the system under risk (e.g. cross-site scripting).

## • Insecure Data Storage

Data storage vulnerabilities may occur when software developers assume that users or malware cannot have access to a mobile device's filesystem and subsequent sensitive information. This can result in data loss or extraction of the app's sensitive information via mobile malware, modified apps or forensic tools.

## • Insecure Communication

Insecure communication puts the data being transmitted at risk of exposure and may lead to leakage of sensitive information. The issue could be caused by poor handshaking, incorrect Secure Sockets Layer (SSL) versions, weak negotiation and plain text communication of sensitive assets.

## • Insecure Authentication

Attackers may compromise passwords, keys, or authentication tokens to impersonate the identity of other users. The issue could be caused by the absence or improper implementation of authentication mechanisms and bad session management.

## • Insecure Authorisation

Some apps, after authenticating users, grant them some authorizations by default. These authorizations are sometimes mistakenly too extended, providing the apps with rights they should not have. If an attacker gets access to privileged rights in an application, it can result in unauthorised access to sensitive information.

## • Insufficient Cryptography

Attackers may steal or access poorly protected data if they are not encrypted or encrypted by improper use of cryptographic functions.

## Client Code-level Mistakes

Code-level mistakes may lead to vulnerabilities such as buffer overflows and memory leaks by passing malicious input to the mobile app. This may result in foreign code execution or denial of service on remote servers.

## • Code Tampering

Attackers may modify a mobile app via creating malicious forms of the app hosted in third-party locations. The attacker may also use phishing attacks to induce users for installation.

## • Reverse Engineering

Attackers may analyse the core binary of the mobile app and perform reverse engineering to obtain its source code, libraries, algorithms and other assets with the aim of exploiting vulnerabilities, harvesting sensitive data or stealing intellectual property.

## • Extraneous Functionality

Developers may add hidden backdoors or functions during application debugging. If the developer forgets to remove such backdoors before production, attackers can make use of them to perform malicious attacks.

## 4. Mobile Device Security Management

This section describes how to protect mobile devices during their usage lifecycle, and common security features of mobile device management solutions for users and administrators who are involved in the use and adoption of mobile devices and related management solutions.

## 4.1 Mobile Device Usage Lifecycle

Similar to other information systems, mobile devices include three major stages throughout their usage lifecycle – Provision, Usage and Decommission. The paragraphs below discuss the best practices on how to protect the mobile devices in various stages of the lifecycle.

## 4.1.1 Provision of Mobile Devices

When considering the adoption of mobile devices in business, B/Ds should identify the needs for mobile devices and how mobile device solutions can support their business. A mobile device security policy should be established to specify the business and security requirements for the use of mobile devices, and also develop adequate processes and procedures for provision of mobile devices with the following considerations:

The approval mechanism of mobile devices and the types of approved mobile devices.

The data classification permitted on each type of mobile devices. Sensitive information shall not be stored in privately-owned mobile devices.

The control mechanism to ensure the compliance with government security requirements based on the data classification.

Define and maintain a list of authorised software including freeware, open source software and programming libraries based on operational needs.

The procedures to ensure timely sanitisation of sensitive data stored in the mobile devices when a staff is posted out or ceases to provide services.

B/Ds should review and modify their processes and procedures with necessary adjustments to include the following best practices in the provisioning stage:

● Identify the list of models that fulfils the operation and security requirements.

Perform risk assessments prior to deployment of new models of mobile devices, and implement a continuous risk monitoring mechanism for evaluating changes in or new risks associated with the mobile devices.

Install security control tools, such as Mobile Device Management (MDM)1, Data Loss Prevention (DLP), personal firewall software and anti-malware solution whenever feasible. The tools should be mentioned in B/Ds' hardening procedures.

Deploy ONLY authorised applications into mobile devices provided by B/Ds. Users may install third-party applications if they are authorised by an officer as designated by the B/Ds.

• Perform security hardening and deliver hardened mobile devices to users.

Disseminate the use policy to users and obtain users' acknowledgement on receiving the use policy and the mobile devices in good condition. The acknowledgement can be a signed agreement or email reply.

Issue security reminders regularly to users to remind them to apply security best practices.

• Enable a power-on password.

Deploy minimal password length and complexity requirements according to B/Ds' departmental security requirements.

Configure the mobile device in such a way that it locks automatically after a period of inactivity.

Enable data erasing feature when there is consecutive incorrect attempts to enter the password if available. The actual number of consecutive incorrect attempts should be defined according to B/Ds operational needs. Remote wipe functionality should also be enabled to protect data from device lost or stolen. Moreover, selection of wiping solution should be carefully made such that sensitive data should not be recovered after the wipe.

Enable device level, full disk or file based encryption feature for all storages of mobile devices, where possible.

Consider using multi-factor authentication such as digital certification together with password for VPN connections.

Maintain asset-tracking information such as serial number, inspect applications on devices, and keep track of them for audit.

Mobile apps permission. In order to minimise the risk of compromise after installation of mobile apps, mobile users should apply least privilege principle with the least amount of system privileges and access rights that are required to run the apps so that the attackers cannot access other applications (e.g. browsers, contacts) or functions of the mobile devices.

During installation of apps, the user should read the content of the data disclosure, privacy policy statement or equivalent and fully understand the security risk of permissions before clicking “I agree” or “Allow”. Usually, some permissions (e.g. contacts, microphone and location information) requested by the apps may not be necessary for core functionalities and can be turned off via the app permission on the mobile devices.

In particular, security hardening procedures of mobile devices should be developed to enforce security configurations in accordance with government security requirements and the mobile device security policy. All mobile devices should be hardened according to the security hardening procedures before transferring to users. For sample configurations regarding security hardening, please refer to Annex A.

## 4.1.2 Usage of Mobile Devices

Even if the security controls have been implemented in the provisioning stage, people and process are two important factors for keeping mobile devices in a safe environment. Therefore, this section focuses on the best practices related to the ongoing operation process for the management and use of mobile devices.

## 4.1.2.1 Administrators

Administrators should follow the best practices as follows:

pay attention to the security news, such as security alert or new release of the app to check available update and/or patches for the mobile device OS and mobile applications; timely take appropriate change management, such as updating the mobile app to the latest version.

If a mobile app is end-of-support or no longer used, users should uninstall the app immediately to prevent attack due to vulnerability of the app.

• Apply the verified update and/or patches to mobile devices.

Check the status of mobile devices regularly to ensure security measures are in place. Use of jail-broken, rooted and compromised devices should be detected and restricted.

• Enforce hardware encryption of a mobile device whenever possible.

Maintain an inventory record with user information and a list of installed mobile applications for the mobile devices provided by the B/D. The list should be maintained by officers as designated by the B/D.

Regarding to the license, B/Ds shall have accountability to regularly keep, update and manage the record of license certificate for all software or mobile apps and ensure an up-to-date and consistent record is kept for all software and mobile app licenses purchased, being used and disposed of. For group license, it is necessary to make sure that the number of software copies installed does not exceed the number of software licenses purchased.

B/Ds should periodically perform inventory check of software and mobile apps to ensure an adequate software license coverage and that no unauthorised software nor mobile app is used.

## 4.1.2.2 Mobile Devices Users

Users should follow the use policy and security reminders including but not limited to:

## DON'Ts:

• Do not modify mobile device setting unless approval is obtained.

Do not try to perform jailbreaking / rooting or exploit the OS of a mobile device by using unauthorised tool. Such manipulation may introduce unexpected security risk and void the warranty.

Do not allow wireless connections from unknown or un-trusted sources to the devices.

Do not open or access links in social media, instant message, Short Message Service (SMS), Multimedia Messaging Service (MMS), or email from misleading, suspicious or un-trusted sources.

Do not download programs and contents as well as install mobile apps from unknown or un-trusted sources.

• Do not install illegal or unauthorised software on the mobile devices.

Do not connect to external data network directly (e.g. via cellular network) when the mobile device is connected to government internal network.

• Do not use public printers.

Do not allow any mobile applications to automatically upload or synchronise information from a mobile device to other unauthorised devices. Example includes the public cloud storage vendors, backup solutions by cloud technology and photo sharing social media.

Do not store password of any other systems (e.g. email, ATM card and network login) on mobile devices. The password auto-save function should be disabled.

Do not use the mobile devices provided by B/Ds extensively for private or personal activities.

## DOs:

• Follow security procedures defined by B/Ds.

• Download and install only applications approved by B/Ds.

Read the privacy policy and the terms and conditions of mobile apps before download/installation.

Ensure the security features of the OS and installed applications are enabled as specified in the hardening procedures.

• Apply the latest malware signatures and definitions when available.

Stay alert to the vulnerabilities of mobile devices, and follow the instructions to apply the relevant patches according to the affected systems and versions.

Perform full data backup with encryption regularly to authorised computers or storage. If the device contains sensitive information, the protection of backup copies shall follow prevailing government security requirements.

Turn off wireless connections such as Wi-Fi, Near Field Communication (NFC), Bluetooth and/or infrared connectivity when not in use.

Enable the network connectivity notification to get users’ confirmation before joining a network.

Disable the Wi-Fi auto-connect or auto-join option to avoid connecting to an untrusted/rogue network automatically.

Turn off location services setting in your mobile device when location-based applications are not in use.

Be cautious when connecting to publicly available Wi-Fi hotspots, and do not access government data unless with adequate security protection.

Establish a VPN connection to your B/D's government internal network. This can ensure that all data transmission would be subject to the corresponding security controls.

Safeguard a mobile device in your possession and do not leave the device unattended without proper security measures.

Enable time-out function to lock the devices when unattended. Be aware of surrounding environment when handling sensitive information to mitigate the risks of overhearing and peeping.

## 4.1.2.3 Data Protection of mobile apps

In order to minimise the privacy concern due to unauthorised access, data disclosure and abnormal data usage when using mobile apps, the functions of mobile apps should only be accessed, operated or granted the necessary rights based on “least-privileged rights” and “need-to-know” principles. In addition, users or administrators should regularly check the privacy setting on the devices and “opt-out” the unwanted data collection of the mobile apps.

Data Collection. In general, mobile apps should have clearly stated the purpose of data collection and what data is to be collected, used or processed through the apps. In order to protect the mobile user’ privacy, the users should avoid providing excessive personal data (e.g. identity card number, home address, credit card number and signature, etc.) through the mobile apps, such as registration of mobile app accounts.

Data Usage. If the collected data is not used in the proper way as stated in the privacy policy statement or terms and conditions of the mobile app, such as sharing with other apps or parties, the personal data poses the risk of data leakage. Unless the mobile user has given prior consent, personal data should only be used for the purpose for which it is originally collected or a directly related purpose.

Data Retention. Usually, the data collected by the mobile apps would be deleted when a user uninstalls the mobile apps. In order to prevent the collected personal data to be transferred to other apps or parties, all app-related personal data should not be kept longer than is necessary for fulfilment of the purpose for which the data is used.

Data Transfer. All app-related personal data should be stored in mobile devices or the designated storage servers with encryption owned by the developer of mobile app. Unless mobile users have given prior consent, the mobile app data, especially personal data and other app-related data, shall not be outsourced, transferred, uploaded or stored in other backend servers, public cloud storage and other platforms/destinations as well as third-party.

## 4.1.3 Decommissioning of Mobile Devices

At the last stage of mobile device management, the devices may be decommissioned due to physical damage, end of support, re-issue to other staff or other B/Ds, etc. B/Ds should define device decommission procedures consisting of secure data deletion, mobile devices factory reset and disposal such that mobile devices can be re-used or securely disposed without data leakage. Mobile administrators and users should follow the practices in order to protect government data in safe custody and reduce the chance for data leakage to unauthorised parties.

## Administrators

Administrators should follow the best practices as follows:

• Verify the condition of the returned devices.

Check whether sensitive information has been processed and/or kept in the device.   
If in doubt, it should be assumed that it has.

Clear or destroy government data securely before disposal, reuse or repair. If the device contains sensitive information, administrators shall follow government security requirements. For physical damage, mobile users should inform administrators the classification of information stored in the damaged mobile device.

• Perform vendor factory reset, if available.

## Mobile Users

Users should follow the best practices as follows:

• Perform necessary data backup for B/Ds' operations.

Clear or destroy information securely before returning the mobile devices to administrators who may not be legitimate to access that information. For information erasure, please refer to the corresponding section in IT Security Guidelines and the Practice Guide for Destruction and Disposal of Storage Media.

• Return the mobile device as soon as possible.

Users are advised to read the privacy policy and the terms and conditions carefully before downloading software and mobile apps from official websites, mobile app stores (e.g. Apple’s App Store, Google Play or the Microsoft Store) or other trusted sources with approval.

## 4.1.4 Awareness Training

User training is an important activity to promote user security awareness in using mobile devices. Government staff should understand security requirements from mobile user's point of view such that human error can be minimised. Training to mobile users should be arranged to deliver them a certain level of understanding of security threats, security requirements and the security measures related to mobile devices.

Generally speaking, the awareness training to mobile users should include:

Information classification and corresponding security requirements for sensitive information in mobile devices.

● Security requirements for mobile devices in using and decommissioning stage.

• Reporting mechanism of lost or stolen mobile devices.

• News and trends of mobile devices security.

## 4.2 Mobile Device Management Solution

Mobile Device Management (MDM) solution facilitates the remote management of mobile devices running different mobile platforms. B/Ds should consider MDM solution to streamline the support efforts of mobile devices, and enable deployment of mobile devices with better security control.

It is noted that most of MDM solutions cannot be used to manage portable computers installed with desktop platforms as MDM software is primarily designed for platforms for mobile phones and tablets. B/Ds should check the latest features of MDM solution.

## 4.2.1 Capabilities of Mobile Device Management Solution

MDM solution provides management capabilities in policy, inventory, security and service for mobile devices such as mobile phones and tablets. Some technical features are listed below for reference only and should not be regarded as mandatory requirements. When selecting MDM solution, B/Ds should consider the needs to enforce security controls with regard to their own business and operation environment.

• Deploy and configure mobile devices with pre-configured setting.

Remote access the mobile devices and push the latest patches2 and configurations to enhance security control of devices.

• Management of mobile applications, such as installation and removal.

• Provide audit trailing details on data accessing.

Enforce security controls such as using VPN for encrypting information transmission over wireless network.

• Monitor abnormal activities.

• Data wipe after repeated logon attempt failure.

• Wipe remotely when a mobile device is lost or stolen.

Containerisation – it provides an isolated environment for processing data via physical, virtual or per-app container (Please refer to Annex B).

## 4.2.2 Best Practices on Mobile Device Management Solution

The following are some best practices commonly through MDM solution for security management of mobile devices.

• Enforcement of Security Policy

With the help of MDM solution, technical measures could be uniformly enforced on all mobile devices provided by B/Ds in accordance with the departmental IT security policy and other relevant policies, procedures and guidelines. The configured MDM security policies should be documented and reviewed regularly.

## • User and Device Authentication

To access internal resources, the user and the device should be authenticated via various means, for example, network-based device authentication, password authentication, and token-based authentication. After idled for a predefined period, the device should be locked automatically. Remote lock functionality should be enabled such that administrators could lock the device remotely in case the device is believed to be lost, stolen, or left in an unsecured location.

## • Secure Data Communication and Storage

Data communications between the managed mobile devices and B/Ds' backend services should be protected by strong encryption, such as Virtual Private Network (VPN) technologies. Data stored on both built-in storage and removable media storage should also be protected by strong encryption. Data within the containers should be also encrypted. No copy/paste and cut/paste are permitted outside the MDM realm. Remote wipe functionality should be enabled in case the device has been lost or stolen. After a certain number of incorrect authentication attempts, the device should wipe itself automatically.

## • Manage Permissions for Apps

Mobile users should pay attention to the permission request of mobile apps. When users download or install mobile apps, they may be asked for permission to let the apps access information on the mobile devices, e.g. access contacts, collect the locations visited or the websites visited. Some permissions are not absolutely necessary for the app’s operation. Also, some mobile app may request to grant full permission of all functions (e.g. camera, contacts, location, microphone, storage and telephone) by default. Such requests may raise personal data privacy concern.

Some practices related to the permissions of apps are listed below:

Restrict the permissions resources (e.g. camera, microphone, location) assigned to each application so as to protect privacy.

Restrict the app-synchronization and sharing services (e.g. local device synchronization, remote synchronization services and websites).

\- Disable the synchronisation services of mobile applications if not needed.

Enable application-level encryption to prevent unauthorised access when device-level encryption is comprised or has not enabled.

The digital signatures on applications should be verified to ensure that only applications from trusted sources could be installed on the device and that code has not been modified.

## • Distribute and Manage Apps

\- Enable remote wipe unauthorised or suspicious apps on mobile devices.

Whitelist applications to ensure that the users are allowed to use only the apps (including apps developed in-house or bundled in the mobile devices) approved by the organization.

## • Data Residency

MDM solution may be cloud-based or on-premise. Some information (e.g. mobile device information, location) would be collected and resided on MDM. If the information is considered sensitive, on-premise MDM solution would be preferred so as to secure the data.

## 4.3 Scenario Specific Security Guidance

This section provides security guidance focusing on different scenarios of government staff in using mobile devices, including: installation of mobile security software, mobile security risk assessment, handling sensitive information, sharing of mobile devices within B/Ds, and loss or theft and security incident relating to mobile device. Other than the best practices mentioned in section 4.1, these scenarios may commonly occur in daily operation with noticeable impact to mobile device security. Example includes improper sensitive information handling, data leakage to other teams through device sharing or loss/theft of mobile devices, and attacks to mobile devices due to software vulnerabilities.

## 4.3.1 Features of Mobile Security Software

Mobile security software (e.g. anti-virus software) enables security scanning on mobile devices to protect from harmful virus and malicious activities and secure the personal data on the mobile devices. They can scan apps before installation and also prevent the installed apps from accessing other applications.

Features of mobile security software includes, but not limited to:

• Anti-theft / remote lock (device or app)

• Block spam SMS/Call

• Permission manager (track and manage app permission to safeguard the apps and devices)

Privacy advisor (vet the apps installed on mobile devices and ensure no sensitive data would be compromised)

• Wi-Fi security check

• Real-time scanning

• Anti-virus protection

• Malware detection

• Anti-phishing protection

Safe browsing mode (e.g. web filtering which blocks or alerts users to browse websites that have web-based malware or phishing)

• Privacy cleaner (Securely clear the browsing history)

## 4.3.2 Mobile Security Risk Assessment

Mobile Security Risk Assessment aims to facilitate mobile users to perform selfevaluation of mobile security before updating whitelist as well as installing authorised software and mobile apps. This could help B/Ds assess the security risk of mobile devices before installation of authorised software and mobile apps.

B/Ds are recommended to develop a security checklist for user reference. B/Ds should clearly define their own checklist with security consideration based on the business operation. The checklist should include but not limited to the following:

• Authorised users (e.g. all staff, designated team / staff or administrator).

Required permission of mobile app (e.g. follow “least privilege” principle, no misconfigured permission).

• Access, collection and use of mobile data.

• Mobile app authentication (e.g. two-factor authentication).

• Security of mobile app (e.g. data encryption, known vulnerabilities).

Security of data protection (e.g. encryption during transmission, no upload nor transmit data from mobile devices).

Data storage of mobile app (i.e. app-related data is solely stored in mobile devices or designated data centres).

• Source of mobile app for downloading (e.g. official websites, vendor’s app stores)

Secure network connectivity (e.g. disable auto-join connectivity function in the mobile devices).

Passing mobile app security vulnerability test tool (i.e. no vulnerability nor malicious behaviour is detected from the mobile app and thereby passing the testing)

## 4.3.3 Handling Sensitive Information with Mobile Devices

In compliance with the security requirements of the Government, B/Ds shall observe government security requirements and documents. In addition, B/Ds should adopt the following security practices to protect mobile devices and information against common security threats:

• Do not process or store TOP SECRET or SECRET information on mobile devices

Do not process CONFIDENTIAL or RESTRICTED information on privatelyowned mobile devices.

Encrypt all sensitive information when stored in and transmitted from a mobile device.

• Minimise storing of sensitive information on a mobile device.

Do not store sensitive information on mobile device, except the information is protected with appropriate security measures.

Do not synchronise sensitive information from a mobile device to public cloud storage, privately-owned IT equipment or other unauthorised devices.

Completely clear or destroy all sensitive information in a mobile device when it is no longer required, and protect the storage of the device until disposal or reuse.

• Do not store sensitive information in privately-owned mobile devices.

If the mobile device contains sensitive information, put the mobile device in a secure place and keep it in a locked room or cabinet, when not attended.

Use privacy screen filter to narrow the viewing angle and position carefully the display screen so that sensitive information cannot be peeked by unauthorised persons.

Configure multi-level password control for use of a mobile device and access to sensitive information, if possible.

• Do not capture screen displaying any sensitive information.

Do not allow sensitive information to be transferred to the facilities of public IT services and vendors' backup services.

Remind mobile users to inform administrators or the responsible party as soon as possible about any loss, theft or damage of government mobile device. Mobile users are responsible for the security and should protect the mobile devices from theft, loss and damage at all times.

## 4.3.4 Shared Access to Mobile Devices

Shared access to government mobile devices should be prohibited unless among persons who are authorised to access all the information stored on the device. Shared access should be authorised based on operational need. Example includes departmental mobile device accessing information within a team, testing device for mobile application development, and outside work and roster based jobs such as data centre operation. B/Ds should ensure that all activities in relation to sensitive information are tracked by audit trails and logical access control software in case shared access is needed.

If there is operational need for sharing mobile devices across government staff, the staff should observe the following best practices:

• Store information based on need-to-know basis.

• Do not perform any backup unless authorised.

• Log out all applications after use or when handing over to other staff.

• Do not configure or store individual email account and password.

## 4.3.5 Loss, Theft and Security Incident

Mobile devices are usually small in size and easy to be stolen or lost. B/Ds should review and modify their security incident handling procedures with necessary adjustments for incident handling of lost or stolen devices. Users should report promptly and escalate if an information security incident occurs in accordance with the security incident handling procedures.

In particular, B/Ds should consider including the following best practices for handling lost or stolen mobile devices:

• Revoke the user accounts that may have been compromised.

Remotely wipe the data stored on the lost or stolen devices, whenever technically possible.

Establish, test and regularly review the handling procedures for handling lost or stolen mobile devices.

Report the incident to the Government Information Security Incident Response Office (GIRO) if sensitive data is involved.

## 4.4 Security Guidance On Privately-Owned Mobile Devices

One basic security concern related to using privately-owned mobile devices in organisational environment is the role of ownership. With the sole control of their mobile devices, staff may install any mobile applications based on their own preferences, which may introduce malware to the mobile devices. In addition, staff may modify the booting up software and/or firmware of their mobile devices to override vendors' defined security controls so as to gain more control and flexibility on the devices. For these devices connecting to the government internal networks without proper protective measures, they can become a point to breach security such as disclosure of sensitive information and spreading malware into the government internal network or becoming attacking devices controlled by malware. In view of the above security risks together with the risk of data leakage due to the loss of the devices to the wrong hands, using privately-owned mobile devices for business purpose should not be allowed unless with adequate security protection.

When considering adopting mobile device solution involving privately-owned mobile devices, B/Ds should observe government security requirements about use of privately-owned IT equipment. In addition, S17 section 20.1.3 requires that unclassified information should also be protected from unintentional disclosure.

For handling unclassified information, Mobile Device Management (MDM) and Mobile Data Loss Prevention (Mobile DLP) are possible technical solutions for protecting government information from unauthorised access when using privatelyowned mobile device for business purpose. MDM focuses on management of the devices as well as mobile apps while mobile DLP emphasises on data controls. B/Ds may refer to the Practice Guide for Data Loss Prevention for additional considerations in protecting government information under different scenarios. The security services of a typical MDM solution are specified in section 4.2.1.

## 4.5 Restrictions on Mobile Devices and Access Levels

B/Ds should specify their business and security requirements for the use of mobile device technologies in the mobile device security policy. For example, B/Ds may limit the types of mobile devices (by operating system version, by brand/model of mobile phone, etc.) and require tiered levels of access, such as allowing government provided mobile devices to access many resources, while privately-owned mobile devices running the B/D's mobile device management client software to access a limited set of resources.

B/Ds should make their own risk-based decisions about what levels of access should be permitted from which types of mobile devices. Some factors that B/Ds should consider when setting mobile device security policy are highlighted in the following:

## • Compliance with government security requirements

Privately-owned mobile devices for business purpose should not be allowed unless adequate security protection is enforced in accordance with government security requirements.

## • Sensitivity of work

Some work involves access to sensitive information or resources, while other work does not. B/Ds may have more restrictive requirements for work based on their business needs.

## • Technical limitations

Certain types of mobile devices or operating systems may be needed, such as those with hardware-based security features or those running a particular mobile device management client software.

## • Work location

Risks will generally be lower for devices used only in the environment under B/Ds' direct control than for devices used in a variety of locations.

## 5. Mobile App Development Security

This section is intended for developers who are involved in mobile app development life cycle. For users and administrators who are involved in the use and adoption of mobile devices and related management solutions, please refer to Section 4 - Mobile Device Security Management.

## 5.1 Considerations in Mobile App Development

Mobile apps are also susceptible to different threats as the applications are now used to access sensitive information and perform business critical activities. As a best practice to develop and maintain secure mobile apps, various security considerations and measures, both technical and administrative, need to be implemented during different stages of mobile app development.

The methodology on software development is evolving such as agile software development, DevOps / DevSecOps (compounding "development", "security" and "operations") for continuous integration and continuous delivery to build mobile apps faster and/or more secured using an iterative development process. It focuses on continuous communication, integration, measurement and delivery to foster the processes between app development, testing and quality assurance. No matter what methodology is used, design for a secure mobile app should be embedded into every stage of development life cycle, in particular early stage, so as to minimise security risk and avoid re-work due to design deficiency.

The following are common stages and key security considerations to help identify potential security risks in mobile app development:

<table><tr><td rowspan=1 colspan=1>Development Life Cycle</td><td rowspan=1 colspan=1>Security Considerations</td></tr><tr><td rowspan=1 colspan=1>Requirement</td><td rowspan=1 colspan=1>Security requirements should be defined along withfunctional requirements and further incorporatesecurity during other phases of software development.</td></tr><tr><td rowspan=1 colspan=1>Design</td><td rowspan=1 colspan=1>Design the application architecture in accordance withthe security specifications aligned in the requirementstage.</td></tr><tr><td rowspan=1 colspan=1>Development</td><td rowspan=1 colspan=1>Develop the mobile app following secure coding bestpractices and perform source code security assessment.</td></tr><tr><td rowspan=1 colspan=1>Testing</td><td rowspan=1 colspan=1>Validate the performance, accuracy and security ofsystem functionalities.</td></tr><tr><td rowspan=1 colspan=1>Pre-production</td><td rowspan=1 colspan=1>Perform security risk assessment and security audit.</td></tr><tr><td rowspan=1 colspan=1>Maintenance and Support</td><td rowspan=1 colspan=1>Maintain security assurance with continuous testingand appropriate security controls.</td></tr><tr><td rowspan=1 colspan=1>Decommission</td><td rowspan=1 colspan=1>Decommission the app when it no longer serves thepurposes.</td></tr></table>

## 5.2 Mobile App Development Lifecycle

## 5.2.1 Requirement Stage

Security should be considered during the requirement phase so that security is included throughout the development life cycle. Security requirements should be defined along with functional requirements and further incorporate security during other phases of software development. If the requirements are defined properly, identified risks could be addressed in early stages, which can greatly reduce extra work in later stages and remediation effort. The following areas should be considered for security requirements:

## • Architecture, Design and Threat Modelling Requirements

Process should be in place to ensure the security concern has been explicitly addressed when planning the architecture and design of the mobile app. The functional and security roles of each component should be well defined. Topics such as threat modelling, secure development and key management should be covered. For example, apply relevant and sufficient security controls to safeguard the data and transactions before implementation.

## • Data Storage and Privacy Requirements

Developers should have good understanding on the type and sensitivity of data to be handled and if any critical transaction would be involved. Sensitive data can be unintentionally exposed to other apps on the same device and data may also be leaked during transmission. Moreover, mobile devices are more easily lost or stolen compared with other types of devices. Developers should adhere to concerned laws and regulations on privacy, e.g. Personal Data (Privacy) Ordinance, in order to define a suitable data storage and privacy requirements. Privacy Impact Assessment (PIA) should be conducted if the mobile app has significant privacy implications.

## • Cryptography Requirements

Cryptography should be adopted in protecting the data stored in and processed on a mobile device, or in transit between the device and servers. Ensure the mobile app uses cryptography according to industry best practices, including:

(i) Use of proven cryptographic libraries.

(ii) Proper choice and configuration of cryptographic primitives.

(iii) Do not reuse the same cryptographic key for multiple purposes.

(iv) Generate random values using a sufficiently secure random number generator.

## • Authentication and Session Management Requirements

User accounts and sessions should be properly authenticated and managed. This includes using randomly generated access tokens to authenticate client requests, enforcing explicit password policy, and locking of user account when excessive login attempts are found, etc. Applications should also be properly handled for change of states, such as requiring re-authentication when the app resumes from background.

## • Network Communication Requirements

Developers should ensure the confidentiality and integrity of information exchanged between the mobile apps and remote service endpoints. Encrypted channel using the TLS protocol with appropriate settings should be used for handling all application data. When using TLS, the apps must enforce certificate validation functions and should not accept self-signed and/or un-trusted certificates. Apps should also be able to detect the use of unauthorised certificates to defend against network attack (e.g. man-in-the-middle attacks).

## • Platform Interaction Requirements

Platform application program interfaces (APIs) and standard components in a secure manner including communications between apps (inter-process communications, e.g. communication of APIs resided in different containers) should be considered.

## • Code Quality and Build Setting Requirements

Security coding practices should be followed in developing the app. For example, the app should be signed with trusted certificate. The certificate should have expiry date. Upon renewal, the security requirements of the certificate should be reviewed (e.g. cipher algorithm, key length) to ensure the well-known vulnerabilities are not inherited in the newly issued certificate. Mobile device default accessed entitlement should be reduced to minimum (e.g. disable camera/microphone and enable "Do Not Track" by default).

## • Resilience Against Reverse Engineering Requirements

If the mobile app will process or access sensitive information, protection measures should be applied to increase the app's resiliency against reverse engineering. A list of obfuscation controls such as "app isolation", "impede dynamic analysis and tampering", "device binding" and "emulator detection" should be considered.

## 5.2.2 Design Stage

The design stage involves designing the application architecture in accordance with the specifications aligned in the requirement stage. As application architecture is established, development team should review the system design by identifying possible compliance issues as well as security risks with reference to defined security requirements. This includes designing appropriate security controls for a given type of data and incorporating threat modelling to identify and address the risks associated with the application.

A security review should also be conducted in the design stage. It serves as a checkpoint to ensure necessary security requirements are identified and incorporated in the system design.

## 5.2.3 Development Stage

Observing secure coding standards can help improving security and reducing the number of common mistakes that may result in security breaches. Performing security assessments during the development stage also helps to identify necessary security controls, and provides timely feedback to developers regarding the security of their codes. Source code security assessments should also be performed to provide an early indicator of code quality in order to deliver consistent, high-quality mobile apps.

## 5.2.4 Testing Stage

In addition to user acceptance test, system tests, stress tests, regression tests and unit tests are also useful in validating the performance and accuracy of system functionalities. Testing mobile apps could be more challenging than web apps due to the high variant of platforms and testing environment. A comprehensive testing plan should be established to design the testing approach and define the details on "what", "when" and "how" to test.

## 5.2.5 Pre-Production Stage

A security risk assessment with security audit should be performed before the production launch and after any major changes. Each vulnerability fix may require updates to custom codes that could introduce new vulnerabilities. It is imperative to continuously assess the risk and impact to maintain secure mobile app.

## 5.2.6 Maintenance and Support Stage

New functionalities to the app or updates to existing functions may introduce changes in which security controls should be identified, documented, tested and reviewed to ensure that the system can be effectively protected from attacks or being compromised. Continuous testing is vital to maintain security assurance and protect the app where most attacks occur. The app should be regularly reviewed to ensure sufficient security is in place.

## 5.2.7 Decommission Stage

Consider decommissioning the app if it no longer meets the purposes, or when there are other apps that can better serve the business. Some suggestions on the decommission plan:

Develop communication strategy to inform all necessary stakeholders (e.g. app users)

• Remove the app from the production environment (e.g. app store)

## 5.3 Security by Design and Data Privacy

Security by design and data privacy should be embedded into the whole app system design and development processes to protect the data and individual's right to privacy. Developers should ensure that security issues are incorporated as part of the basic architectural design. Detailed designs for possible security issues should be reviewed, and mitigations for possible threats should be determined and developed. Related laws, regulations and ordinances (e.g. Personal Data (Privacy) Ordinance) should also be followed when defining the privacy requirements. Developers should pay attention to the following best practices during system design in order to protect users' privacy.

## User Notification

Inform users on what information / data that the app would collect, what purpose it serves on and how data would be handled.

• Allow users to opt-out from any personal data access/use.

Offer users with option to delete all app-related data and account related information when they request to remove the app or delete the account.

Display privacy policy statement to the user on the installation page of the mobile app to explain the purpose of data collection, access and use so as to enhance the users’ trust.

## Data Handling

Reduce the collection of personal data (especially for sensitive personal data) and permission of mobile devices features (e.g. camera and location tracking) to the absolute minimum.

Protect users' personal data from unauthorised access, disclosure or use by using strong encryption and access control. Avoid storing personally identifiable information (PII) (e.g. credential ID, call logs) or other sensitive data on the user device.

Do not upload or synchronise sensitive information to external systems or devices without users' permission.

Discard sensitive data after fulfilling the claimed data usage purpose (e.g. geolocation data).

## 5.4 Testing for Mobile App Development

Testing mobile apps on mobile devices can be more challenging than testing web applications on personal computers due to wide varieties of mobile OS, hardware components and network environment, etc. The following areas should be considered in mobile app testing cycle.

## Testing Mobile App Functionality

To make sure the mobile app functions properly on supported devices, functional testing should be conducted to verify the mobile app features specification. There are also different types of mobile app testing that need to be considered:

Compatibility testing: Ensure the mobile app functions properly on supported devices with different mobile platforms such as iOS and Android, and with different screen sizes and versions of operating systems.

Performance testing: Measure the app performance such as response speed, acceptable user load and app stability, etc.

System testing: Ensure the mobile app handles possible exception and recovers properly from accidental termination.

## Testing Code Quality

Developers use a wide variety of programming languages and frameworks in mobile app development. Common vulnerabilities such as injection flaws, memory corruption, and cross-site scripting, may manifest in apps when failed to follow secure programming practices. For example, injection attacks against a mobile app are most likely to occur through inter-process communication (IPC) interfaces, where a malicious app attacks another app running on the device. Testing should be conducted to identify possible entry points for untrusted input or to identify known, dangerous library / application program interface (API) calls.

To ensure the source codes of mobile apps would not compromise due to vulnerabilities, regular code scanning should be conducted to detect any vulnerabilities or flaws that may pose a risk to the mobile devices at earlier stage.

## Cryptography in Mobile Apps

Cryptography is crucial in securing the user's data in a mobile environment, where attackers may have physical access to the user's device. Proper encryption or use appropriate key storage APIs should be adopted for storing sensitive information. Avoid using any cryptographic algorithms or protocols that contain known weaknesses. Adopt the best practices and security configurations to ensure the cryptographic algorithms are up-to-date and in-line with industry standards. Outdated ciphers such as DES, or hashing function such as SHA1 must not be used. Other misconfiguration issues such as insufficient key length, hard-coded cryptographic keys and weak key generation functions should be handled properly.

## Mobile App Authentication

Appropriate authentication methods should be integrated and performed by both frontend client and back-end service to protect against attacks such as password dictionary attack or brute force attack. In general, username/password authentication is considered for apps that are not sensitive; two-factor authentication is generally considered for protecting sensitive app (e.g. SMS and token). Testing should be conducted to ensure the authentication procedure is consistently enforced on both front-end client and back-end server.

The following steps should be tested on authentication and authorisation:

• Identify the additional authentication factors the app uses.

• Locate all endpoints that provide critical functionality.

• Verify that the additional factors are strictly enforced on all server-side endpoints.

## Testing Network Communication

Network communication between mobile devices and servers usually takes place over untrusted networks. It may put the mobile app at risk of network-based attacks such as packet sniffing or man-in-middle-attacks. Encrypted connection (e.g. HTTPS) should be used to ensure confidentiality and integrity of the network data while handling sensitive data. Intercept the incoming and outgoing network traffic of the app being tested and make sure that the traffic is encrypted. A packet analyser can be used to capture the network traffic and a network protocol analyser can be used to display the captured traffic in a human-readable format. After all, verify that the server is configured according to best practices.

## 5.5 Points to Note for Securing Mobile App Development

Mobile apps are subject to similar security considerations and risks as other applications, thus general best practices for application development are also relevant to mobile app development. Due to varying use cases, usage patterns and various mobile platforms, mobile app developers should also take note of the remote web services, platform integration issues and insecurity of mobile devices. Developers should consider the following areas to build a secure mobile app:

• General Considerations

• System/Software

• Data

• Network Management

## 5.5.1 General Considerations

Adopt security-in-mind approach and apply adequate protection for sensitive data being handled.

Inform users on what information the app would access or upload, and for what purpose.

Provide a personal information collection statement if personal information will be collected.

Apply "least privilege" principle to run the app with the least amount of system privileges and access rights.

• Develop and implement the app according to best practices.

• Design and provision an app to allow updates for security patches.

Refuse executing the app or alerting users in case jailbreaking or rooting is detected if the app would process critical/ sensitive data.

Validate all client provided data before processing with expected whitelist of data types, data range, and data length.

• Inform users and obtain consent for any app activities that consumer a lot of data.

## 5.5.2 System/Software

## Authentication and Session Management

Avoid solely using device-provided identifier (like UID or MAC address) to identify the device, but rather leverage identifiers specific to the app as well as the device.

Adopt appropriate authentication mechanism, consider two-factor authentication based on risk assessment of the mobile app, such as processing sensitive or financial transactions.

Avoid storing passwords, wipe/clear memory locations holding passwords directly after their hashes are calculated.

Always make use of the latest security mechanism provided by mobile platform to protect user credentials.

Perform checking at the start of each activity/screen to see if the user is in a logged in state. If not, switch to the login state.

Discard and clear all memory associated with the user data, and any master keys used to decrypt the data when an app's session is timed out or user logout.

## Server Controls

Assess backend services for mobile apps for vulnerabilities and ensure that the backend system is running with a hardened configuration with the latest security patches applied.

Ensure sufficient logs or information are retained on the backend servers to detect and respond to incidents and perform investigation.

Review the code of the app to avoid unintentional data transfer between the mobile app and backend servers.

## Code Obfuscation / Reverse Engineering

Verify the app signature on start-up to ensure that the code has not been altered or corrupted.

Use obfuscation software to protect source code and hide the app details as far as possible if it is not compiled to machine code format to prevent reverse engineering.

Implement anti-debugging techniques (e.g. prevent a debugger from attaching to the process) for apps containing sensitive data.

## Use of Third-Party/Open Source Libraries

Use reliable and/or official versions of software development tools (e.g. software development kits, software libraries) to avoid introducing Trojan Horses or backdoors unknowingly.

Track third-party frameworks/ APIs used in the mobile app for security patches and perform upgrades.

Validate all data when received from and send to un-trusted third-party apps (e.g.   
ad network) before incorporating their use in the mobile app.

## 5.5.3 Data

## Data Storage and Protection

• Only collect and disclose data which is required for business use of the app.

Classify data storage according to sensitivity and apply controls accordingly.   
Process, store and use data according to its classification.

Personal data should be encrypted and limited access control based on “least privilege” and “need to know” principles.

Application data should not be stored in external storage unless appropriate security measures (e.g. strong encryption) are applied.

Use encryption with appropriate algorithm and key length when storing or caching sensitive data to non-volatile memory and keep minimum necessary data for the use of mobile app for the sake of data protection.

Perform input validation and perform checking on related areas that the app can receive data to prevent client-side code injection or screen hijack.

• Discard and clear all sensitive data from memory when no longer needed.

Adopt sandboxing technology to improve security by isolating an application to prevent other applications from interacting with the protected app.

## On-line Payment

• Warn users and obtain consent for any cost implications for app behaviour.

If paid-for resources are involved, security controls such as a whitelist model or re-authentication for paid-for resources should be implemented to prevent unauthorised or accidental access.

Use secure mobile payment services if online payment is required. Use application program interfaces (APIs)/templates provided by the official providers and follow closely their guidelines for implementation.

Inform users the minimum technical specifications that a mobile device must support for the payment service (e.g. TLS).

Adhere to the specific data security standard (e.g. The Personal Information Protection Law (PIPL) of the People’s Republic of China, PCI DSS) on developing a mobile app with on-line mobile payment.

## 5.5.4 Network Management

## Communication Security

Transmission of any sensitive data such as personal data or credit card information should be protected with end-to-end encryption (e.g. TLS).

When using TLS, the apps must enforce certificate validation functions and should not accept self-signed and/or un-trusted certificates.

Detect if the connection is HTTPS with every request when it is known that the connection should be HTTPS.

Enable per-app VPN to secure access internal network resources from anywhere and on any mobile devices.

## 5.6 Best Practices on Secure Mobile Development for Android and iOS

Developers may also refer to the Best Practice Guide for Mobile App Development published by the Privacy Commissioner for Personal Data (PCPD), which is available at PCPDs’ website.

(https://www.pcpd.org.hk/english/resources\_centre/publications/guidance/files/Mobi leapp\_guide\_e.pdf)

## \*\*\* ENDS \*\*\*

## Annex A: Sample Configurations for Security Hardening

Security configurations for mobile device hardening are recommended below for reference. The configurations may be enhanced and modified based on B/Ds' business needs. Some configurations require additional security solution such as MDM or DLP solution for enforcement purpose. B/Ds may seek advice from product vendors or third party consultants for best practices on security hardening if necessary.

<table><tr><td colspan="1" rowspan="1">Controls³</td><td colspan="1" rowspan="1">Portable Computers</td><td colspan="1" rowspan="1">Mobile Phones andTablets</td></tr><tr><td colspan="3" rowspan="1">Password</td></tr><tr><td colspan="1" rowspan="1">Require password</td><td colspan="1" rowspan="1">Yes</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Require complex password (mixed-casealphabetic characters, numerals andspecial characters)</td><td colspan="1" rowspan="1">Yes</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Minimum password length</td><td colspan="1" rowspan="1">8</td><td colspan="1" rowspan="1">8</td></tr><tr><td colspan="1" rowspan="1">Number of failed attempts allowed</td><td colspan="1" rowspan="1">5</td><td colspan="1" rowspan="1">5</td></tr><tr><td colspan="1" rowspan="1">Maximum password age</td><td colspan="1" rowspan="1">Every three months to sixmonths</td><td colspan="1" rowspan="1">Every three months to sixmonths</td></tr><tr><td colspan="1" rowspan="1">Password history</td><td colspan="1" rowspan="1">8</td><td colspan="1" rowspan="1">8</td></tr><tr><td colspan="1" rowspan="1">Inactive device timeout</td><td colspan="1" rowspan="1">At most 5 minutes</td><td colspan="1" rowspan="1">At most 5 minutes</td></tr><tr><td colspan="3" rowspan="1">Other Device Setting</td></tr><tr><td colspan="1" rowspan="1">Detect and restrict jail-broken, rooted orsoftware version violations</td><td colspan="1" rowspan="1">Yes</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Allow installing apps from trusted sources</td><td colspan="1" rowspan="1">Yes</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Allow installing apps from unknownsources</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow backup to vendor's cloud service</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow keychain / key repository backup</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow photo sharing</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow USB file transfer</td><td colspan="1" rowspan="1">Yes, if encrypted4</td><td colspan="1" rowspan="1">Yes, if encrypted4</td></tr><tr><td colspan="1" rowspan="1">Allow users to accept untrusted TLScertificates</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow modifying account setting</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow tethering configuration</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow biometric to unlock device</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Show notification messages when thescreen is locked</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Modify Bluetooth setting</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow sending diagnostic and usage datato mobile vendor</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Require encryption on device (e.g. fulldisk or file based encryption)</td><td colspan="1" rowspan="1">Yes</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Enable audit trails</td><td colspan="1" rowspan="1">Yes</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Controls3</td><td colspan="1" rowspan="1">Portable Computers</td><td colspan="1" rowspan="1">Mobile Phones andTablets</td></tr><tr><td colspan="1" rowspan="1">Use auto time or synchronise with trustedtime server</td><td colspan="1" rowspan="1">Yes</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Force encrypted backups</td><td colspan="1" rowspan="1">Yes</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Enable Remote Wipe</td><td colspan="1" rowspan="1">Not available5</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Enable local wipe when maximum offailed attempt reached</td><td colspan="1" rowspan="1">Not available5</td><td colspan="1" rowspan="1">Yes</td></tr><tr><td colspan="1" rowspan="1">Allow mail preview</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Allow message preview</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Enable auto-connect/auto-join networks</td><td colspan="1" rowspan="1">No</td><td colspan="1" rowspan="1">No</td></tr><tr><td colspan="1" rowspan="1">Enable ask to join networks</td><td colspan="1" rowspan="1">Yes, if available</td><td colspan="1" rowspan="1">Yes, if available</td></tr></table>

## Annex B: Containerisation Technology

The central aspect of a mobile management strategy is creating distinct lines of separation on privately-owned mobile devices between users' personal apps and business apps and their associated data. This has come to be known as containerisation, the securing of business apps and their associated data within digital containers (either physical or virtual) that govern app behaviour and prevent unauthorised interaction with personal apps.

With the various container offerings from different vendors, there are three main types of containerisation, namely, physical container, virtual container and per-app container.

## Physical Container

Working at the chipset or kernel level of a mobile device to separate business apps and their data from a user's personal app. Physical containers create hardware level segmentation between a mobile user's business environment and personal environment. Implying a separate OS stack at the kernel level just for business apps to reside and operate. This OS stack is completely distinct from the mobile device's normal OS stack where the users' regular apps reside. As it is a separated domain, administrators can enforce organisation specific security requirements to that particular "Physical Container". A key security aspect of physical containers is that the OS stack typically has to leverage processor-specific capabilities.

One of the biggest benefits offered by physical containers is the top to bottom secure isolation that they offer between the separate OS stack and the device's normal OS stack, ensuring that no interaction can occur between business and personal apps. Since it is a separated platform, the vulnerability will not inherit from mobile device.

However, this stack-level isolation creates one of the major drawbacks inherent to physical container solutions—disruption of the user experience. Whenever users log into the mobile devices' normal OS stack, they have to exit and then enter into another separate OS stack to use a corporate app. When they want to use a personal app, they have to reverse the process. The constant switching between physical containers not only creates user inconvenience, but also would affect user productivity over an extended period of time. Currently, this kind of solution is OS dependent; third-party and internal software developers have to customise the application to support the physical container.

## Virtual Container

Business apps are segmented within an encrypted workspace inside the operating system comparable to a single sandbox with multiple apps running inside it. Policies are implemented to govern what types of interactions may occur among apps inside the virtual container. All interactions between business apps in the container stay within the container. All business apps stay within the same container for interaction. Likewise, all of the data associated with the virtual container's apps remains secure within the confines of the virtual sandbox.

Mobile users are required to input a separated password for authenticating the container and perform business activities. With the adoption of virtual container, the logical separation between the business apps and personal apps is executed by the operating system and kernel.

Since the container runs inside the mobile device, the vulnerabilities of the operating system and kernel may affect the security of the container. Furthermore, the solution requires thirdparty and internal software developers to develop or modify their apps to support a vendorspecific container environment. Virtual container strategy also requires specific skills and additional administration effort in the on-going support activities.

## Per-App Container

Per-app container provides a secure self-contained sandbox to each individual app and its associated data, which can provide more granular control to its administrators in securing organisational data, while presenting users a more seamless user experiences. Under this model, administrators can choose to configure general policies that apply to all apps, specific policies for individual apps, or a combination of both. Administrators can also granularly control the directional flow of data for each app, such as inbound and outbound communications. Additionally, since each contained app's data is individually encrypted and secured by policy, the business app will remain protected if a malicious app happens to infect the mobile device.

As enforcement is on per-app basis, users typically do not have to constantly enter and exit contained and non-contained environments to switch between personal apps and business apps. Users can easily see and access all the apps they are authorised to use whether they are personal or corporate apps. The combination of the per-app policy governance and application-level encryption gives B/Ds the additional level of security they need to keep their business apps and data safe.

## Annex C: Assessment Guidelines to Authorised Mobile Apps

## 1. Guidelines to assess mobile apps

To assess if mobile apps are suitable to be installed, B/Ds are advised to understand whether the purpose of the mobile app can meet the business or operational needs and whether the mobile app is secured enough for use. One important consideration is that the installation of mobile app should not result in the compromise of the security level of the existing mobile environment or lead to data breach.

B/Ds are suggested to take a risk-based approach to assess the mobile apps in various aspects as below:

## • Functionality of mobile apps

Apart from understanding whether the mobile app is applicable to support business or operational use, B/Ds should evaluate if there is any risk from all features, including those extra features, provided by the mobile app that may affect the security level of the mobile environment. Disable those functionalities that are not necessary, if possible.

## • Reputation and credibility of mobile apps

The off-the-shelf mobile app must be available for download from official mobile app store such as App Store or Google Play. In addition, the mobile app must be downloaded from trusted mobile app store for installation. It is preferable to show a mass download or obtain security verification certificate such as ISO/IEC 15408, Common Criteria.

## • Free from malware

B/Ds should scan the mobile app to check if it is free from viruses, spyware, malware, etc.   
after downloading when security tools are available from that mobile platform.

## • Reasonable permissions required by mobile app

Mobile app permissions can give apps control to access resources (such as contacts, messages, camera, location, phone, storage, etc.) in mobile devices and interaction with other applications (such as browsers) of the mobile device. B/Ds should examine if the permission granted to the mobile app is reasonable.

## • Connection with back-end platform

B/Ds should evaluate if the mobile app would automatically connect to external back-end services, websites or cloud platforms to understand the appropriateness of websites or cloud platforms to be interacted, whether there would be automatic data collection involved (e.g. understanding disclosure agreement for user consent), and whether there is any potential sensitive data involved.

The above criteria serve as general guidance and are not exhaustive. B/Ds are also advised to regularly monitor the update of the mobile app, for example, whether the mobile app is still available for download from official app store. For more stringent security requirements, B/Ds are advised to conduct SRAA together with code scanning to understand the security level of mobile app source codes as well as the appropriate use of third-party tools (software library, advertising networks, API, etc.).

## 2. Updating application whitelist for business use

Regarding the formulation of the whitelist, some B/Ds may adopt the Software Asset Management (SAM) to maintain software inventory and software licensing information to ensure authorised software and mobile apps are used in B/Ds. SAM helps B/Ds control software acquisition as well as reduce misuse of mobile devices and risk of unintentional copyright infringements and maximise user productivity. The list of authorised inventory in SAM can be considered as whitelist for users to install authorised software and mobile apps on B/Ds’ mobile devices. Also, the list of pre-installed mobile apps on the B/Ds mobile devices can be considered as well. Both inventories should be reviewed periodically to ensure that the list of authorised software and mobile apps is up-to-date.

If software or mobile apps are not in the application whitelist, mobile users should submit requests with supporting justification (e.g. support business needs/operations, improve work productivity). B/Ds are recommended to perform mobile security risk assessment for the required mobile apps as specified in Section 4.3.2 . All B/Ds shall comply with all software and mobile apps licenses, purchase agreements and the existing legislation on copyright as advised by Intellectual Property Department (IPD). B/Ds are advised to read the privacy policy and the terms and conditions of software or mobile apps carefully. If in doubt, B/Ds are recommended to consult the software vendor or IPD for clarification. After obtaining the approval from the Heads of B/Ds via approval mechanism, B/Ds shall update the application whitelist accordingly.

## 3. Sample of whitelist and blacklist

A whitelist consists of the list of trusted and authorised software or mobile apps which are considered safe to be installed on the mobile devices provided by B/Ds. To develop application whitelist, B/Ds should make reference to the inventory in SAM that is maintained by B/Ds. Besides, the maintenance and review of application whitelist should be performed regularly.

A blacklist is the opposite of a whitelist. It is a list of the software and mobile apps that are prohibited to be installed or run on the mobile devices as they could cause cyber security threats. However, the effort of keeping a blacklist up-to-date would be great.

In general, whitelist and blacklist should include the following information for reference.

Whitelist configuration (including Government self-developed / authorised app)
<table><tr><td rowspan=1 colspan=1>No.</td><td rowspan=1 colspan=1>Configuration setting</td><td rowspan=1 colspan=1>Sample value</td></tr><tr><td rowspan=1 colspan=1>1.</td><td rowspan=1 colspan=1>Whitelist App – Name</td><td rowspan=1 colspan=1>GovHK Notifications</td></tr><tr><td rowspan=1 colspan=1>2.</td><td rowspan=1 colspan=1>Whitelist App – Developer / Vendor</td><td rowspan=1 colspan=1>HKSARG</td></tr><tr><td rowspan=1 colspan=1>3.</td><td rowspan=1 colspan=1>Whitelist App – Version</td><td rowspan=1 colspan=1>2.1.0</td></tr><tr><td rowspan=1 colspan=1>4.</td><td rowspan=1 colspan=1>Platform (e.g. iOS, Android, Windows 10)</td><td rowspan=1 colspan=1>iOS / Android</td></tr><tr><td rowspan=1 colspan=1>5.</td><td rowspan=1 colspan=1>Devices (e.g. iPhone, iPad, Android phone, Androidtablet, laptop)</td><td rowspan=1 colspan=1>iPhone/iPad/Androidphone/Android tablet</td></tr><tr><td rowspan=1 colspan=1>6.</td><td rowspan=1 colspan=1>Action to apply when trying to install whitelist app</td><td rowspan=1 colspan=1>AllowAccess /Enable</td></tr><tr><td rowspan=1 colspan=1>7.</td><td rowspan=1 colspan=1>Authorised User group to access (e.g. all user, userin designated team, senior manager or above)</td><td rowspan=1 colspan=1>All user</td></tr><tr><td rowspan=1 colspan=1>8.</td><td rowspan=1 colspan=1>Justification</td><td rowspan=1 colspan=1>For theinteroperability teston differentapplications</td></tr><tr><td rowspan=1 colspan=1>9.</td><td rowspan=1 colspan=1>Software Type (e.g. free download from thewebsite, free download via app store, purchasedlicense personally)</td><td rowspan=1 colspan=1>Free download viaapp store</td></tr><tr><td rowspan=1 colspan=1>10.</td><td rowspan=1 colspan=1>Link of Terms and Conditions</td><td rowspan=1 colspan=1>https://www.xxx.com/licensing.html</td></tr><tr><td rowspan=1 colspan=1>11.</td><td rowspan=1 colspan=1>Date of approval (YYYYMMDD)</td><td rowspan=1 colspan=1>20201213</td></tr><tr><td rowspan=1 colspan=1>12.</td><td rowspan=1 colspan=1>Expired date of approval (YYYYMMDD)</td><td rowspan=1 colspan=1>20221213</td></tr><tr><td rowspan=1 colspan=1>13.</td><td rowspan=1 colspan=1>Open source software (e.g. Y, N)</td><td rowspan=1 colspan=1>N</td></tr><tr><td rowspan=1 colspan=1>14.</td><td rowspan=1 colspan=1>Freeware, shareware or purchased</td><td rowspan=1 colspan=1>Freeware</td></tr></table>

## Blacklist configuration

<table><tr><td rowspan=1 colspan=1>No.</td><td rowspan=1 colspan=1>Configuration setting</td><td rowspan=1 colspan=1>Sample value</td></tr><tr><td rowspan=1 colspan=1>1.</td><td rowspan=1 colspan=1>Blacklist App – Name</td><td rowspan=1 colspan=1>MyGame</td></tr><tr><td rowspan=1 colspan=1>2.</td><td rowspan=1 colspan=1>Blacklist App – Developer / Vendor</td><td rowspan=1 colspan=1>GameDeveloper</td></tr><tr><td rowspan=1 colspan=1>3.</td><td rowspan=1 colspan=1>Blacklist App – Version</td><td rowspan=1 colspan=1>1.0.3</td></tr><tr><td rowspan=1 colspan=1>4.</td><td rowspan=1 colspan=1>Platform (e.g. iOS, Android, Windows 10)</td><td rowspan=1 colspan=1>iOS</td></tr><tr><td rowspan=1 colspan=1>5.</td><td rowspan=1 colspan=1>Devices (e.g. iPhone, iPad, Android phone, Androidtablet, laptop)</td><td rowspan=1 colspan=1>iPhone/iPad/Androidphone/Android tablet</td></tr><tr><td rowspan=1 colspan=1>6.</td><td rowspan=1 colspan=1>Action to apply when trying to install app</td><td rowspan=1 colspan=1>BlockAccess</td></tr><tr><td rowspan=1 colspan=1>7</td><td rowspan=1 colspan=1>Date of adding in the Blacklist (YYYYMMDD)</td><td rowspan=1 colspan=1>20201220</td></tr></table>