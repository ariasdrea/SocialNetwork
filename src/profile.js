import React from "react";
import ProfilePic from "./profilepic";
import Bio from "./bio";

export default function Profile(props) {
    return (
        <div className="profile-container">
            <ProfilePic
                profilePicUrl={props.profilePicUrl || "quest.png"}
                showUploader={props.showUploader}
            />
            <div>
                <Bio bio={props.bio} setBio={props.setBio} />
            </div>
        </div>
    );
}
