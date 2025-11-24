import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import NotificationAppointmentModal from "./NotificationAppointmentModal";

export default function NotificationModalRouteWrapper() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        // otwieramy modal po wejœciu na trasê
        setOpen(true);
    }, []);

    const handleClose = () => {
        setOpen(false);
        navigate(-1); // wraca o 1 stronê wstecz
    };

    return (
        <NotificationAppointmentModal
            open={open}
            appointmentId={id}
            onClose={handleClose}
        />
    );
}
